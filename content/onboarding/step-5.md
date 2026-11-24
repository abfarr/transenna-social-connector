## Step 5 of 5: Hand back the filled kit

Give the client these files, each as a downloadable .md file named exactly as below so the kit's prompts can find them.

1. **Client Onboarding Brief**: every blank from the list, grouped the same way, each answer with its source and every gap marked [CONFIRM]. End with the social review from step 3 and a short "Recommended style direction" note: the direction you'd pick, at most one move to borrow from another direction, why, and whether their photos meet that direction's needs.

2. **Example Captions**: the confirmed captions from step 3, each with its platform and date if known. If there were fewer than 5, add the client's best writing from other sources and say so.

3. **Step 1 prompt**: call `build_kit_prompt` with prompt `voice_guide`. Pass `stock_photos: true` only if they said yes to Unsplash. For a Sells account, also pass the sells fields (topics and offers, CTAs, props) from what you gathered.

4. **Step 2 prompt**: call `build_kit_prompt` with `brand_existing` if they have a logo, colors and fonts, with `brand_materials` set to the actual file names and URLs. Otherwise use `brand_new`.

5. **Step 3 prompt**: call `build_kit_prompt` with `design_system`.

6. **Project instructions**: call `build_kit_prompt` with `project_instructions`. Leave the design system link out; it doesn't exist until step 3 is done.

7. **Template Index**: call `build_kit_prompt` with `template_index`.

8. **Setup checklist**: what's left before they send the Step 1 prompt. Files to add to their project (Client Onboarding Brief, Example Captions, Template Index, inspiration screenshots), photos still to add to their library (with their upload link), which prompt to send in which order, and every open [CONFIRM] item in one list.

Use the prompt text exactly as `build_kit_prompt` returns it. Don't edit, shorten or rewrite it.

Before handing back, check:
- The account type in the Step 1 prompt matches the brief
- The brief says whether Unsplash stock photos are allowed
- Every hex, font and claim in the brief has a source
- No copy from the website, other accounts or inspiration is presented as the client's own words
- Nothing in the brief breaks the hard rules for their account type

Finish with a 3-line summary: what you used, what's still open, and the one next step: "Add these files to your project, then send the Step 1 prompt in a new chat there."
