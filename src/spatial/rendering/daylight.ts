// Realistic day and night at every distance. Cesium shades the globe by the Sun only from
// afar: within about 3,600 km of the ground it fades the shading out, and the ground
// atmosphere fades out with it (forcing the shading on brings the atmosphere back too,
// which washes a close-up view out). So the shading Cesium leaves out at the camera's
// distance is applied here instead: the globe material darkens the night side by exactly
// that much, and buildings are shaded by the same term, so every distance and every
// surface agrees with Cesium's own day/night shading.

import { Material, PerInstanceColorAppearance } from 'cesium';

/** Cesium's day/night shading term (GlobeFS): 30% light at night, full light once the Sun is above about 8°. */
const DAYLIGHT_GLSL = /* glsl */ `
float continuumDaylight(vec3 positionEC)
{
    vec3 positionWC = (czm_inverseView * vec4(positionEC, 1.0)).xyz;
    vec3 upEC = normalize(czm_viewRotation * normalize(positionWC));
    return clamp(czm_getLambertDiffuse(czm_lightDirectionEC, upEC) * 5.0 + 0.3, 0.0, 1.0);
}
`;

/**
 * Globe material for realistic lighting. `fadeOut`/`fadeIn` are the globe's lighting fade
 * distances: where Cesium's own shading applies in full, this adds nothing.
 */
export function nightShadeMaterial(fadeOut: number, fadeIn: number): Material {
  return new Material({
    fabric: {
      uniforms: { fadeOut, fadeIn },
      source: /* glsl */ `${DAYLIGHT_GLSL}
czm_material czm_getMaterial(czm_materialInput materialInput)
{
    czm_material material = czm_getDefaultMaterial(materialInput);
    float light = continuumDaylight(-materialInput.positionToEyeEC);
    float applied = clamp((length(czm_view[3]) - fadeOut) / (fadeIn - fadeOut), 0.0, 1.0);
    // Cesium then multiplies by mix(1.0, light, applied); together they give 'light'.
    material.diffuse = vec3(0.0);
    material.alpha = 1.0 - light / mix(1.0, light, applied);
    return material;
}`,
    },
    translucent: false,
  });
}

/** Cesium's PerInstanceColorAppearanceFS, darkened on the night side like the ground. */
const BUILDING_FS = /* glsl */ `
in vec3 v_positionEC;
in vec3 v_normalEC;
in vec4 v_color;
${DAYLIGHT_GLSL}
void main()
{
    vec3 positionToEyeEC = -v_positionEC;
    vec3 normalEC = normalize(v_normalEC);
#ifdef FACE_FORWARD
    normalEC = faceforward(normalEC, vec3(0.0, 0.0, 1.0), -normalEC);
#endif
    vec4 color = czm_gammaCorrect(v_color);
    czm_materialInput materialInput;
    materialInput.normalEC = normalEC;
    materialInput.positionToEyeEC = positionToEyeEC;
    czm_material material = czm_getDefaultMaterial(materialInput);
    material.diffuse = color.rgb;
    material.alpha = color.a;
    vec4 lit = czm_phong(normalize(positionToEyeEC), material, czm_lightDirectionEC);
    out_FragColor = vec4(lit.rgb * continuumDaylight(v_positionEC), lit.a);
}
`;

/** Opaque building appearance: shaded by day and night when `realistic`, else always lit. */
export function buildingAppearance(realistic: boolean): PerInstanceColorAppearance {
  return new PerInstanceColorAppearance({
    translucent: false,
    closed: true,
    ...(realistic ? { fragmentShaderSource: BUILDING_FS } : {}),
  });
}
