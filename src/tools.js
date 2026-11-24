import { onboarding, kit } from "./content.js";
import { FORMATS, MAX_SLIDES, validateRenderInput, renderSlides, toBase64, RenderError } from "./render.js";
import { listPhotos, fileUrl, thumbPath } from "./files.js";

const ACCOUNT_KINDS = {
  sells: "business",
  teaches: "teaching or coaching practice",
  creator: "creator account",
};

const PROMPTS = [
  "voice_guide",
  "brand_new",
  "brand_existing",
  "design_system",
  "project_instructions",
  "template_index",
];

// Read-only hints let ChatGPT and Claude run these without a confirmation prompt.
const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };

export const tools = [
  {
    name: "start_onboarding",
    title: "Start social post onboarding",
    description:
      "Start setting up the social post system for a new client or brand. Call this when the user wants to onboard, set up their social media system, or fill in their brand details. Returns the first step's instructions.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: readOnly,
  },
  {
    name: "get_onboarding_step",
    title: "Get onboarding step",
    description:
      "Get the instructions for one onboarding step (1 to 5). Call it with the next step number once the current step is done.",
    inputSchema: {
      type: "object",
      properties: { step: { type: "integer", minimum: 1, maximum: 5, description: "Step number, 1 to 5." } },
      required: ["step"],
      additionalProperties: false,
    },
    annotations: readOnly,
  },
  {
    name: "build_kit_prompt",
    title: "Build a filled kit prompt",
    description:
      "Return one of the client's kit prompts with their details filled in, ready to save as a file or paste into their project. Use in onboarding step 5. Return the text to the client exactly as given.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          enum: PROMPTS,
          description:
            "voice_guide = Step 1 prompt; brand_new / brand_existing = Step 2 prompt; design_system = Step 3 prompt; project_instructions = Step 4 project instructions; template_index = Template Index file.",
        },
        name: { type: "string", description: "Brand or account name." },
        your_name: { type: "string", description: "Name of the person who posts in first person." },
        account_type: { type: "string", enum: Object.keys(ACCOUNT_KINDS), description: "Sells, Teaches or Creator." },
        account_kind: {
          type: "string",
          description: "Optional. How to describe the account, e.g. 'bakery' or 'coaching practice'. Defaults from account_type.",
        },
        website: { type: "string", description: "Website URL, or 'none'." },
        brand_materials: {
          type: "string",
          description: "For brand_existing: the actual file names and URLs they're providing (website, screenshots, logo files, exports).",
        },
        design_system_link: { type: "string", description: "For project_instructions, if the design system already exists." },
        sells_topics_offers: { type: "string", description: "Sells only: products or services by exact name, plus confirmed promotions." },
        sells_ctas: { type: "string", description: "Sells only: the CTAs that fit how they sell." },
        sells_props: { type: "string", description: "Sells only: prop and cutout ideas from their world." },
        stock_photos: {
          type: "boolean",
          description: "voice_guide only: true if the client allows Unsplash stock photos for general scenes when their library has nothing that fits.",
        },
      },
      required: ["prompt"],
      additionalProperties: false,
    },
    annotations: readOnly,
  },
  {
    name: "get_photo_upload_link",
    title: "Get photo upload link",
    description:
      "Get the client's private link for adding photos, cutouts and logo files to their photo library. Give it to the client when they need to add or change photos.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: readOnly,
  },
  {
    name: "list_photos",
    title: "List library photos",
    description:
      "List the photos in the client's library, with a link to each and small previews so you can choose. Use these links as image sources in post designs.",
    inputSchema: {
      type: "object",
      properties: {
        offset: { type: "integer", minimum: 0, description: "Skip this many photos (for paging). Default 0." },
        limit: { type: "integer", minimum: 1, maximum: 24, description: "How many photos to return. Default 12." },
        previews: { type: "boolean", description: "Include small previews. Default true." },
      },
      additionalProperties: false,
    },
    annotations: readOnly,
  },
  {
    name: "render_post",
    title: "Render post images",
    description:
      `Turn approved post designs into PNG files the client can download and post. Pass one HTML document per slide, built at the exact size: post ${FORMATS.post.width}x${FORMATS.post.height}, story ${FORMATS.story.width}x${FORMATS.story.height}, square ${FORMATS.square.width}x${FORMATS.square.height}. ` +
      "Use plain HTML and CSS (scripts don't run). Load fonts from Google Fonts with a <link> tag. Use https image links only: photos from list_photos, or Unsplash photo URLs when the client allows stock photos. " +
      "Returns a download link and a small preview of each slide; check the previews before handing back. Up to " + MAX_SLIDES + " slides per call.",
    inputSchema: {
      type: "object",
      properties: {
        slides: { type: "array", items: { type: "string" }, minItems: 1, maxItems: MAX_SLIDES, description: "One full HTML document per slide, in order." },
        format: { type: "string", enum: Object.keys(FORMATS), description: "post (default), story or square." },
      },
      required: ["slides"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
];

class ToolInputError extends Error {}

function fill(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (values[key] === undefined) throw new Error(`Template value missing: ${key}`);
    return values[key];
  });
}

function need(args, fields) {
  const missing = fields.filter((f) => !args[f] || !String(args[f]).trim());
  if (missing.length) {
    throw new ToolInputError(`Missing ${missing.join(", ")}. Ask the client for these, then call build_kit_prompt again.`);
  }
}

function accountRules(args) {
  const type = String(args.account_type).toLowerCase();
  const block = kit.accounts[type].trim();
  if (type !== "sells") return block;
  // The kit's Sells block only has hard rules; add the lines the other types have.
  const extra = [
    `Topics and offers list (section 6 of the guide): ${args.sells_topics_offers || "the products and services I sell, by exact name, plus any promotions I confirm"}. Posts point only to these.`,
    "Interview topics: what I sell and to whom, my products or services and their exact names, how people buy, what customers get (in my words), and the sourcing, materials and certifications I can claim.",
    `CTAs: ${args.sells_ctas || "shop, book, order, visit, link in bio, save this post (only the ones that fit how I sell)"}.`,
    `Prop and cutout ideas (paper, notes and tags only for the Tactile direction): ${args.sells_props || "my products, packaging, tools, materials, workspace and the place I work"}.`,
  ].join("\n\n");
  const [title, ...rest] = block.split("\n");
  return [title, "", extra, "", ...rest].join("\n").replace(/\n{3,}/g, "\n\n");
}

function imageSources(stock) {
  const base =
    "- Images: choose images yourself from my photo library (call list_photos to see them). Pick the hero image to fit the concept, don't reuse one in a carousel, and name which images you used in the assumptions line.";
  if (!stock) return base + " Don't use stock photos.";
  return (
    base +
    " If nothing in my library fits, you may use an Unsplash photo through the Unsplash connector, only for general scenes, textures and backgrounds, never to stand in for my products, my place, my team or me. Credit each one in the assumptions line as \"Photo by (photographer) on Unsplash\"."
  );
}

function buildPrompt(args) {
  switch (args.prompt) {
    case "voice_guide": {
      need(args, ["name", "your_name", "account_type", "website"]);
      const type = String(args.account_type).toLowerCase();
      if (!ACCOUNT_KINDS[type]) throw new ToolInputError("account_type must be sells, teaches or creator.");
      return fill(kit.voiceGuide, {
        name: args.name,
        your_name: args.your_name,
        account_kind: args.account_kind || ACCOUNT_KINDS[type],
        website: args.website,
        image_sources: imageSources(args.stock_photos === true),
        account_type_rules: accountRules({ ...args, account_type: type }),
      });
    }
    case "brand_new":
      return kit.brandNew;
    case "brand_existing":
      need(args, ["brand_materials"]);
      return fill(kit.brandExisting, { brand_materials: args.brand_materials });
    case "design_system":
      return kit.designSystem;
    case "project_instructions":
      need(args, ["name", "your_name"]);
      return fill(kit.projectInstructions, {
        name: args.name,
        your_name: args.your_name,
        design_system_link: args.design_system_link || "[paste your design system link here after Step 3]",
      });
    case "template_index":
      need(args, ["name"]);
      return fill(kit.templateIndex, { name: args.name });
    default:
      throw new ToolInputError(`Unknown prompt. Use one of: ${PROMPTS.join(", ")}.`);
  }
}

const text = (t) => ({ content: [{ type: "text", text: t }] });

// ctx: { env, cid (client id), key, origin, checkRenderQuota }
export async function callTool(name, args = {}, ctx = {}) {
  try {
    switch (name) {
      case "start_onboarding":
        return text(onboarding.overview + "\n" + onboarding.steps[1]);
      case "get_onboarding_step": {
        const step = Number(args.step);
        if (!onboarding.steps[step]) throw new ToolInputError("step must be a number from 1 to 5.");
        return text(onboarding.steps[step]);
      }
      case "build_kit_prompt":
        return text(buildPrompt(args).trim() + "\n");
      case "get_photo_upload_link":
        return text(
          `Photo library upload page: ${ctx.origin}/upload/${ctx.key}\n\n` +
            "Tell the client to open it in a browser and add their best photos, product shots, cutouts (PNG with a transparent background) and logo files, with clear file names. It's private to them, so they shouldn't share it."
        );
      case "list_photos":
        return await photosResult(ctx, args);
      case "render_post": {
        const input = validateRenderInput(args);
        if (input.error) throw new ToolInputError(input.error);
        const quota = await ctx.checkRenderQuota(input.slides.length);
        if (!quota.ok) throw new ToolInputError(quota.message);
        const rendered = await renderSlides(ctx.env, ctx.origin, input.slides, input.format);
        const lines = rendered.map((r, i) => `Slide ${i + 1}: ${r.url}`).join("\n");
        return {
          content: [
            { type: "text", text: `Rendered ${rendered.length} ${rendered.length === 1 ? "image" : "images"} (${input.format.width}x${input.format.height} PNG). Give the client these download links:\n${lines}\n\nPreviews follow. Check each one before handing back; if anything is cut off, overlapping or unreadable, fix the HTML and render again.` },
            ...rendered.map((r) => ({ type: "image", data: r.preview, mimeType: "image/jpeg" })),
          ],
        };
      }
      default:
        return null; // unknown tool: caller returns a JSON-RPC error
    }
  } catch (err) {
    if (err instanceof ToolInputError || err instanceof RenderError) return { ...text(err.message), isError: true };
    throw err;
  }
}

async function photosResult(ctx, args) {
  const all = await listPhotos(ctx.env, ctx.cid);
  if (!all.length) {
    return text("The photo library is empty. Call get_photo_upload_link and ask the client to add their photos and logo files.");
  }
  const offset = Math.max(0, Number(args.offset) || 0);
  const limit = Math.min(24, Math.max(1, Number(args.limit) || 12));
  const page = all.slice(offset, offset + limit);
  const lines = page.map((p, i) => {
    const size = p.width && p.height ? ` ${p.width}x${p.height}` : "";
    const kind = p.type === "png" ? " (PNG, may be a cutout or logo)" : "";
    return `${offset + i + 1}. ${p.name}${size}${kind}\n   ${fileUrl(ctx.origin, p.path)}`;
  });
  const more = offset + page.length < all.length ? `\n\n${all.length - offset - page.length} more: call list_photos with offset ${offset + page.length}.` : "";
  const content = [{ type: "text", text: `${all.length} photos in the library. Showing ${offset + 1} to ${offset + page.length}.\n\n${lines.join("\n")}${more}` }];
  if (args.previews !== false) {
    const thumbs = await Promise.all(
      page.map(async (p) => {
        const obj = await ctx.env.FILES.get(thumbPath(p.path));
        return obj ? toBase64(await obj.arrayBuffer()) : null;
      })
    );
    page.forEach((p, i) => {
      if (!thumbs[i]) return;
      content.push({ type: "text", text: `Preview ${offset + i + 1}: ${p.name}` });
      content.push({ type: "image", data: thumbs[i], mimeType: "image/jpeg" });
    });
  }
  return { content };
}
