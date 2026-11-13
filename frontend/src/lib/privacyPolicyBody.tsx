import { LEGAL_ENTITY } from "@/lib/legalEntity";

const LAST_UPDATED = "2026-11-13";

/**
 * Server-renderable privacy body (no client hooks).
 * English section uses Google OAuth verification checklist headings verbatim.
 */
export function PrivacyPolicyEnglish() {
  return (
    <article lang="en">
      <h1>Privacy Policy — Wroket</h1>
      <p className="text-sm text-zinc-500 dark:text-slate-400">Last updated: {LAST_UPDATED}</p>
      <p>
        This Privacy Policy applies to the <strong>Wroket</strong> web application operated by{" "}
        <strong>{LEGAL_ENTITY.nameEn}</strong> ({LEGAL_ENTITY.registrationEn}),{" "}
        <strong>{LEGAL_ENTITY.addressEn}</strong>. Contact:{" "}
        <a href={`mailto:${LEGAL_ENTITY.privacyEmail}`}>{LEGAL_ENTITY.privacyEmail}</a>.
      </p>

      <h2>Google user data we access</h2>
      <p>
        When you sign in with Google and/or connect Google Calendar, Wroket accesses the following Google user data
        with your consent:
      </p>
      <ul>
        <li>
          <strong>Google Account profile</strong> (<code>openid</code>, <code>email</code>, <code>profile</code>):
          Google user ID, email address, name, and profile picture — used only to create and authenticate your Wroket
          account.
        </li>
        <li>
          <strong>Google Calendar read</strong> (
          <code>https://www.googleapis.com/auth/calendar.readonly</code>): event titles, start/end times, durations, and
          free/busy status for calendars you explicitly select — used to show busy slots in Wroket Agenda and suggest
          free slots for tasks.
        </li>
        <li>
          <strong>Google Calendar write</strong> (
          <code>https://www.googleapis.com/auth/calendar.events</code>): create or update calendar events and optional
          Google Meet links — used only when you explicitly book or sync a Wroket time slot. Connecting OAuth alone does
          not write any events.
        </li>
      </ul>

      <h2>How we use Google user data</h2>
      <p>
        Wroket uses Google user data solely to provide and improve user-facing features that are prominent in the
        product (account sign-in, Agenda free/busy display, and explicit calendar booking/sync). We do not use Google
        user data for advertising, analytics resale, credit decisions, lending, or any purpose other than operating
        these features.
      </p>
      <p>
        <strong>AI / ML affirmation:</strong> Google user data obtained via Google APIs (including Google Calendar /
        Workspace-related scopes) is <strong>not</strong> used to develop, improve, or train generalized or
        non-personalized artificial intelligence or machine learning models.
      </p>

      <h2>How we share, transfer, or disclose Google user data</h2>
      <p>
        We do not sell Google user data. We do not transfer or disclose Google user data to third parties for purposes
        other than providing or improving Wroket, except:
      </p>
      <ul>
        <li>
          <strong>Google Cloud Platform</strong> as hosting sub-processor (EU regions) to run the application
          infrastructure;
        </li>
        <li>when required by applicable law.</li>
      </ul>
      <p>
        Optional in-app features that send a photo or note text you choose (Cloud Vision / Gemini) do{" "}
        <strong>not</strong> receive Google Calendar OAuth data. Those features only process content you explicitly
        submit for that action and do not store that content beyond generating a proposal you confirm.
      </p>

      <h2>How we store and protect Google user data</h2>
      <ul>
        <li>Security procedures are in place to protect the confidentiality of your data.</li>
        <li>We use encryption in transit (TLS 1.2+) and encryption at rest for sensitive data, including Google OAuth tokens.</li>
        <li>Access to production data is limited to application service accounts required to operate the service.</li>
        <li>Passwords (if used) are stored as irreversible hashes.</li>
      </ul>

      <h2>Data retention and deletion</h2>
      <ul>
        <li>
          <strong>Account data:</strong> kept while your account is active; permanently deleted after you request account
          deletion (typically within a few hours).
        </li>
        <li>
          <strong>Google Calendar data:</strong> not retained as a long-term copy; short-lived cache only for Agenda
          display and availability. OAuth tokens are encrypted at rest and revoked when you disconnect Google Calendar in
          Wroket or revoke access in{" "}
          <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer noopener">
            your Google Account
          </a>
          .
        </li>
        <li>
          <strong>Deletion / export:</strong> request deletion or export anytime at{" "}
          <a href={`mailto:${LEGAL_ENTITY.privacyEmail}`}>{LEGAL_ENTITY.privacyEmail}</a> or via in-app account data
          controls where available.
        </li>
        <li>
          <strong>Technical logs:</strong> at most 90 days. <strong>Backups:</strong> at most 30 days.
        </li>
      </ul>

      <h2>Google API Services User Data Policy (Limited Use)</h2>
      <p>
        Wroket&apos;s use and transfer to any other app of information received from Google APIs will adhere to the{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer noopener">
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements.
      </p>

      <h2>Other data we collect (non-Google)</h2>
      <ul>
        <li>Account fields you enter (email, name) and application data you create (tasks, projects, notes).</li>
        <li>Strictly necessary cookies (session, language, theme). No advertising cookies.</li>
      </ul>

      <h2>Your rights (GDPR)</h2>
      <p>
        You may access, rectify, delete, export, object to, or restrict processing of your data, and withdraw consent
        (including Google access) at any time. Contact{" "}
        <a href={`mailto:${LEGAL_ENTITY.privacyEmail}`}>{LEGAL_ENTITY.privacyEmail}</a>. You may lodge a complaint with
        the CNIL (France) or your local EU supervisory authority.
      </p>

      <h2>Contact</h2>
      <p>
        Privacy questions: <a href={`mailto:${LEGAL_ENTITY.privacyEmail}`}>{LEGAL_ENTITY.privacyEmail}</a>.
      </p>
    </article>
  );
}

/** French GDPR-oriented policy (same facts; shown after English for local users). */
export function PrivacyPolicyFrench() {
  return (
    <article lang="fr">
      <h1>Politique de confidentialité — Wroket</h1>
      <p className="text-sm text-zinc-500 dark:text-slate-400">Dernière mise à jour : {LAST_UPDATED}</p>
      <p>
        Wroket est édité par <strong>{LEGAL_ENTITY.nameFr}</strong>, {LEGAL_ENTITY.registrationFr},{" "}
        <strong>{LEGAL_ENTITY.addressFr}</strong>. Contact privacy :{" "}
        <a href={`mailto:${LEGAL_ENTITY.privacyEmail}`}>{LEGAL_ENTITY.privacyEmail}</a>.
      </p>

      <h2>Données Google utilisateur auxquelles nous accédons</h2>
      <ul>
        <li>
          Profil Google (<code>openid</code>, <code>email</code>, <code>profile</code>) : identifiant, e-mail, nom, photo —
          authentification uniquement.
        </li>
        <li>
          Lecture Agenda (<code>calendar.readonly</code>) : titres, horaires, free/busy des agendas que vous sélectionnez —
          affichage Agenda Wroket et suggestions de créneaux.
        </li>
        <li>
          Écriture Agenda (<code>calendar.events</code>) : création / mise à jour d&apos;événements uniquement lorsque vous
          réservez ou synchronisez explicitement un créneau. La connexion OAuth seule n&apos;écrit rien.
        </li>
      </ul>

      <h2>Comment nous utilisons les données Google</h2>
      <p>
        Uniquement pour fournir et améliorer les fonctions visibles (connexion, free/busy, réservation). Pas de publicité,
        revente, scoring crédit, ni entraînement de modèles d&apos;IA généralisés à partir des données Google API /
        Calendar.
      </p>

      <h2>Partage des données Google</h2>
      <p>
        Nous ne vendons pas les données Google. Pas de transfert à des tiers hors hébergement Google Cloud (UE) et
        obligations légales. Vision / Gemini ne reçoivent pas les données Calendar OAuth.
      </p>

      <h2>Stockage et sécurité</h2>
      <ul>
        <li>Procédures de sécurité pour protéger la confidentialité de vos données.</li>
        <li>Chiffrement TLS en transit et chiffrement au repos des jetons OAuth Google.</li>
      </ul>

      <h2>Conservation et suppression</h2>
      <ul>
        <li>Compte : tant qu&apos;actif ; suppression après demande.</li>
        <li>Calendar : cache court ; jetons révoqués à la déconnexion / révocation Google Account.</li>
        <li>Demande : {LEGAL_ENTITY.privacyEmail}</li>
      </ul>

      <h2>Google API Services User Data Policy (Limited Use)</h2>
      <p>
        L&apos;usage des informations reçues des API Google respecte la{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer noopener">
          Google API Services User Data Policy
        </a>{" "}
        et les exigences Limited Use.
      </p>

      <h2>Vos droits (RGPD)</h2>
      <p>
        Accès, rectification, suppression, portabilité, opposition, retrait du consentement. Contact{" "}
        <a href={`mailto:${LEGAL_ENTITY.privacyEmail}`}>{LEGAL_ENTITY.privacyEmail}</a>. Réclamation possible auprès de la
        CNIL.
      </p>
    </article>
  );
}
