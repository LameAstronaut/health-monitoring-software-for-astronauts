# Male crew body image

Generated using the built-in imagegen tool. The existing female asset is preserved.

Reference: `frontend/public/assets/astronaut-body-realistic.png`.
Output: `frontend/public/assets/astronaut-body-male.png`.

Jordan Lee and Sam Rivera use the male variant; Alex Morgan uses the female variant,
as specified by the user. The synthetic registry exposes `body_variant` for image
selection; no inference from crew names is used.

Generation prompt:

> Use case: precise-object-edit. Asset type: risk monitoring crew body illustration, male companion asset. Use the supplied image as the edit target. Create a very similar image but replace the synthetic female astronaut with a synthetic adult male astronaut, short dark hair, natural masculine face and male body proportions. Keep the identical full-body front-facing neutral standing pose, head and feet positions, arms held slightly away from the torso with hands down, the same fitted white/light gray long-sleeved zip-front astronaut training suit with muted blue collar and shoulder accents, gloves absent, boots present. Match the original photorealistic rendering, neutral expression, studio lighting, dark black background with soft gray halo, centered composition, image aspect ratio 2:3. The whole head and both feet must be visible. Maintain very similar silhouette alignment so existing head/chest/abdomen/arm/leg clickable regions remain aligned. No text, no logos, no extra objects. Save as a new companion variant, do not replace the original.
