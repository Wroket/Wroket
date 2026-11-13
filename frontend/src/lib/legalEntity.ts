/**
 * Publisher / data-controller identity for privacy & terms pages.
 * Update SIREN / legal form once the company is registered.
 */
export const LEGAL_ENTITY = {
  /** Display name of the editor (natural person until company registration). */
  nameFr: "François Broudeur",
  nameEn: "François Broudeur",
  /** Honest status while no RCS entry exists yet. */
  registrationFr: "en cours d'immatriculation au Registre du commerce et des sociétés (RCS)",
  registrationEn: "pending registration with the French Trade and Companies Register (RCS)",
  addressFr: "15 rue Léo Frankel, 75013 Paris, France",
  addressEn: "15 rue Léo Frankel, 75013 Paris, France",
  cityFr: "Paris",
  cityEn: "Paris",
  privacyEmail: "team@wroket.com",
} as const;
