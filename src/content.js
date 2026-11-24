// All prompt and onboarding text is bundled into the Worker at build time.
// It is never served as a file; tools return only the piece needed right now.
import overview from "../content/onboarding/overview.md";
import step1 from "../content/onboarding/step-1.md";
import step2 from "../content/onboarding/step-2.md";
import step3 from "../content/onboarding/step-3.md";
import step4 from "../content/onboarding/step-4.md";
import step5 from "../content/onboarding/step-5.md";

import voiceGuide from "../content/kit/step1-voice-guide.md";
import accountSells from "../content/kit/account-sells.md";
import accountTeaches from "../content/kit/account-teaches.md";
import accountCreator from "../content/kit/account-creator.md";
import brandNew from "../content/kit/step2-new-brand.md";
import brandExisting from "../content/kit/step2-existing-brand.md";
import designSystem from "../content/kit/step3-design-system.md";
import projectInstructions from "../content/kit/step4-project-instructions.md";
import templateIndex from "../content/kit/template-index.md";

export const onboarding = {
  overview,
  steps: { 1: step1, 2: step2, 3: step3, 4: step4, 5: step5 },
};

export const kit = {
  voiceGuide,
  accounts: { sells: accountSells, teaches: accountTeaches, creator: accountCreator },
  brandNew,
  brandExisting,
  designSystem,
  projectInstructions,
  templateIndex,
};
