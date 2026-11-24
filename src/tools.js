import { onboarding, kit } from "./content.js";

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
      },
      required: ["prompt"],
      additionalProperties: false,
    },
    annotations: readOnly,
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

export function callTool(name, args = {}) {
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
      default:
        return null; // unknown tool: caller returns a JSON-RPC error
    }
  } catch (err) {
    if (err instanceof ToolInputError) return { ...text(err.message), isError: true };
    throw err;
  }
}
