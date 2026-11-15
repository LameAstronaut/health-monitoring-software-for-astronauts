# Male crew body image

Generated using the built-in imagegen tool. The existing female asset is preserved.

Reference: `frontend/public/assets/astronaut-body-realistic.png`.
Output: `frontend/public/assets/astronaut-body-male.png`.

Jordan Lee and Sam Rivera use the male variant; Alex Morgan uses the female variant,
as specified by the user. The synthetic registry exposes `body_variant` for image
selection; no inference from crew names is used.

Generation prompt:

> Use case: precise-object-edit. Asset type: risk monitoring crew body illustration, male companion asset. Use the supplied image as the edit target. Create a very similar image but replace the synthetic female astronaut with a synthetic adult male astronaut, short dark hair, natural masculine face and male body proportions. Keep the identical full-body front-facing neutral standing pose, head and feet positions, arms held slightly away from the torso with hands down, the same fitted white/light gray long-sleeved zip-front astronaut training suit with muted blue collar and shoulder accents, gloves absent, boots present. Match the original photorealistic rendering, neutral expression, studio lighting, dark black background with soft gray halo, centered composition, image aspect ratio 2:3. The whole head and both feet must be visible. Maintain very similar silhouette alignment so existing head/chest/abdomen/arm/leg clickable regions remain aligned. No text, no logos, no extra objects. Save as a new companion variant, do not replace the original.

## Background correction

The female image has a transparent background. The male companion now also uses
true transparency, exposing the same shared pale-blue `.body-figure` background.
Removed the male image's baked-in dark backdrop and halo using built-in imagegen.
Updated output: `frontend/public/assets/astronaut-body-male.png`.

Edit prompt:

> Use case: background-extraction. Edit target: the provided male astronaut image. Remove the entire dark studio background, gray/brown halo, haze, bloom, aura, floor glow and ALL background illumination. Produce a clean transparent-background cutout of ONLY the existing male astronaut. Keep his face, hair, body, white and blue suit, hands, boots, full-body front-facing pose, exact framing, scale, centered placement and 1024x1536 canvas unchanged. Preserve natural shading within the figure but remove luminous outlines, rim glow and feathered light around the silhouette. Edges must be clean and natural, no gray fringe or translucent cloud outside the person, and the entire space outside the figure including between arms and torso and between the legs must have alpha 0. The result will be displayed on the same pale blue #f0f7fa background as the female companion image. Do not include any colored backdrop, shadow, text, new objects or changes to the subject.
