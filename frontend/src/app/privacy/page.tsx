"use client";

import Link from "next/link";

import { useLocale } from "@/lib/LocaleContext";

/**
 * Bilingual Privacy Policy.
 *
 * IMPORTANT before Google OAuth verification:
 * - Replace every "[À COMPLÉTER ...]" / "[TO BE COMPLETED ...]" placeholder
 *   with the real legal entity, postal address, registration number and DPO contact.
 * - The text below already covers Google API Services User Data Policy
 *   (including the Limited Use disclosure) so that `calendar.events` and
 *   `calendar.readonly` scopes can pass the sensitive-scopes review.
 */
export default function PrivacyPage() {
  const { locale } = useLocale();
  const isFr = locale === "fr";

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-zinc-900 dark:text-slate-100">
      <header className="border-b border-zinc-100 dark:border-slate-800">
        <div className="max-w-3xl mx-auto px-6 py-6 flex items-center justify-between">
          <Link href="/" className="text-sm font-semibold text-zinc-700 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400">
            ← Wroket
          </Link>
          <Link href="/terms" className="text-sm text-zinc-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400">
            {isFr ? "Conditions d'utilisation" : "Terms of service"}
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 prose prose-zinc dark:prose-invert">
        {isFr ? <PrivacyFr /> : <PrivacyEn />}
      </main>

      <footer className="border-t border-zinc-100 dark:border-slate-800 py-8 mt-8">
        <div className="max-w-3xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-zinc-500 dark:text-slate-400">
          <span>
            <span className="font-semibold text-zinc-700 dark:text-slate-300">Wroket</span>{" "}
            <span suppressHydrationWarning>&copy; {new Date().getFullYear()}</span>
          </span>
          <div className="flex items-center gap-6">
            <Link href="/pricing" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
              {isFr ? "Tarifs" : "Pricing"}
            </Link>
            <Link href="/terms" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
              {isFr ? "CGU" : "Terms"}
            </Link>
            <a href="mailto:privacy@wroket.com" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
              privacy@wroket.com
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

const LAST_UPDATED = "2026-05-26";

function PrivacyFr() {
  return (
    <article>
      <h1>Politique de confidentialité</h1>
      <p className="text-sm text-zinc-500 dark:text-slate-400">Dernière mise à jour : {LAST_UPDATED}</p>

      <h2>1. Qui sommes-nous</h2>
      <p>
        Wroket (« nous », « notre service ») est un outil de gestion de tâches et d&apos;agenda édité par <strong>[À COMPLÉTER : raison sociale]</strong>,
        société immatriculée sous le numéro <strong>[À COMPLÉTER : n° d&apos;entreprise]</strong>, dont le siège est situé{" "}
        <strong>[À COMPLÉTER : adresse complète]</strong>. Le responsable de traitement au sens du RGPD est l&apos;éditeur ci-dessus.
        Pour toute question relative à la protection des données, vous pouvez nous écrire à{" "}
        <a href="mailto:privacy@wroket.com">privacy@wroket.com</a>.
      </p>

      <h2>2. Données que nous collectons</h2>
      <h3>2.1 Compte utilisateur</h3>
      <ul>
        <li>Adresse e-mail, prénom, nom (saisis lors de l&apos;inscription ou récupérés via Google / Microsoft SSO).</li>
        <li>Mot de passe stocké sous forme de hash (jamais en clair) si vous créez un compte par mot de passe.</li>
        <li>Identifiants techniques OAuth (Google `sub`, Microsoft `oid`) pour relier le compte à votre fournisseur d&apos;identité.</li>
      </ul>

      <h3>2.2 Données fournies par Google (via OAuth)</h3>
      <p>Si vous utilisez Google SSO ou connectez Google Calendar, nous accédons aux données suivantes avec votre consentement explicite :</p>
      <ul>
        <li>
          <strong>Profil Google (`openid email profile`)</strong> : identifiant Google, adresse e-mail, nom, photo de profil.
          Utilisé uniquement pour créer / authentifier votre compte Wroket.
        </li>
        <li>
          <strong>Calendrier en lecture (`calendar.readonly`)</strong> : titres, dates, durées et statuts disponibilité/occupation des
          événements de vos agendas Google que vous avez explicitement sélectionnés. Utilisé pour afficher vos créneaux occupés
          dans la vue Agenda de Wroket et vous proposer des créneaux libres pour vos tâches.
        </li>
        <li>
          <strong>Calendrier en écriture (`calendar.events`)</strong> : utilisé uniquement pour pousser dans votre Google Calendar
          les créneaux Wroket que vous avez explicitement choisi de synchroniser, et pour créer un Google Meet à la demande.
          Nous n&apos;écrivons aucun événement sans action utilisateur.
        </li>
      </ul>

      <h3>2.3 Données applicatives</h3>
      <ul>
        <li>Tâches, projets, phases, sous-tâches, tags, notes, pièces jointes que vous créez dans Wroket.</li>
        <li>Préférences (langue, thème, agendas connectés, calendrier par défaut).</li>
        <li>Invitations envoyées / reçues, appartenance aux équipes, commentaires.</li>
      </ul>

      <h3>2.4 Données techniques</h3>
      <ul>
        <li>Adresse IP, type de navigateur, journaux d&apos;accès aux API (conservés au maximum 90 jours pour la sécurité et le debug).</li>
        <li>Cookies strictement nécessaires (cookie de session `auth_token`, préférence de langue, préférence de thème). Aucun cookie publicitaire ni de tracking tiers.</li>
      </ul>

      <h2>3. Finalités et bases légales</h2>
      <ul>
        <li>Fourniture du service (exécution du contrat) : création de compte, gestion des tâches et agendas, synchronisation Calendar.</li>
        <li>Sécurité (intérêt légitime) : journaux, détection d&apos;abus.</li>
        <li>Communication transactionnelle (exécution du contrat) : e-mails de vérification, réinitialisation de mot de passe, notifications d&apos;invitation.</li>
        <li>Amélioration du service (intérêt légitime) : statistiques agrégées et anonymisées.</li>
      </ul>

      <h2>4. Conformité Google API Services User Data Policy</h2>
      <p>
        L&apos;utilisation et le transfert vers toute autre application des informations reçues des API Google par Wroket respecteront la{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer noopener">
          Google API Services User Data Policy
        </a>, y compris les exigences <strong>Limited Use</strong>.
      </p>
      <p>Plus précisément, les données obtenues via Google Calendar :</p>
      <ul>
        <li>ne sont utilisées que pour fournir et améliorer les fonctionnalités d&apos;agenda visibles directement par l&apos;utilisateur ;</li>
        <li>ne sont jamais transférées à des tiers, sauf processeurs strictement nécessaires au fonctionnement (hébergement Google Cloud) ou si la loi l&apos;exige ;</li>
        <li>ne sont jamais utilisées pour du ciblage publicitaire, de la revente, ni pour entraîner des modèles d&apos;intelligence artificielle généralisés ;</li>
        <li>ne sont pas lues par un humain, sauf consentement explicite, support technique ponctuel à votre demande, ou obligation légale.</li>
      </ul>

      <h2>5. Partage des données</h2>
      <p>Nous ne vendons pas vos données. Nous partageons uniquement avec :</p>
      <ul>
        <li><strong>Google Cloud Platform</strong> (sous-traitant d&apos;hébergement, région Europe : Belgique / Pays-Bas), pour l&apos;exécution de l&apos;infrastructure.</li>
        <li><strong>Fournisseur d&apos;envoi d&apos;e-mails transactionnels</strong> : [À COMPLÉTER : nom du fournisseur e-mail].</li>
        <li>Autorités, sur réquisition légale uniquement.</li>
      </ul>

      <h2>6. Durée de conservation</h2>
      <ul>
        <li>Données de compte : tant que le compte est actif. Suppression définitive sous 30 jours après votre demande.</li>
        <li>Données Google Calendar : non stockées de manière persistante au-delà du nécessaire (cache court terme pour l&apos;affichage agenda). Les jetons OAuth sont chiffrés au repos et révoqués automatiquement quand vous déconnectez votre agenda.</li>
        <li>Journaux techniques : 90 jours maximum.</li>
        <li>Sauvegardes : 30 jours maximum.</li>
      </ul>

      <h2>7. Sécurité</h2>
      <ul>
        <li>Chiffrement en transit (TLS 1.2+) et au repos pour les données sensibles, dont les jetons OAuth Google.</li>
        <li>Contrôle d&apos;accès strict : seuls les comptes de service applicatifs peuvent lire / écrire en base de données.</li>
        <li>Mots de passe stockés sous forme de hash résistant aux attaques par force brute.</li>
      </ul>

      <h2>8. Vos droits (RGPD)</h2>
      <p>Conformément au RGPD, vous disposez des droits suivants :</p>
      <ul>
        <li>Accès, rectification, suppression de vos données.</li>
        <li>Portabilité (export de vos tâches au format JSON / CSV).</li>
        <li>Opposition et limitation du traitement.</li>
        <li>Retrait du consentement à tout moment (notamment révocation des accès Google dans <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer noopener">votre compte Google</a>).</li>
        <li>Réclamation auprès d&apos;une autorité de contrôle (en Belgique : Autorité de protection des données ; en France : CNIL).</li>
      </ul>
      <p>
        Pour exercer ces droits : <a href="mailto:privacy@wroket.com">privacy@wroket.com</a>. Une réponse vous sera apportée dans un délai d&apos;un mois.
      </p>

      <h2>9. Transferts internationaux</h2>
      <p>
        Vos données sont hébergées en Europe. Si un transfert hors UE devient nécessaire (support, sous-traitant tiers),
        il sera encadré par les Clauses Contractuelles Types de la Commission européenne.
      </p>

      <h2>10. Mineurs</h2>
      <p>Wroket n&apos;est pas destiné aux personnes de moins de 16 ans. Aucune donnée n&apos;est sciemment collectée auprès d&apos;un mineur.</p>

      <h2>11. Modifications de la politique</h2>
      <p>
        Toute modification substantielle vous sera notifiée par e-mail au moins 15 jours avant son entrée en vigueur. La présente politique peut faire l&apos;objet de
        mises à jour mineures sans notification (corrections rédactionnelles).
      </p>

      <h2>12. Contact</h2>
      <p>
        Pour toute question relative à cette politique :{" "}
        <a href="mailto:privacy@wroket.com">privacy@wroket.com</a>.
      </p>
    </article>
  );
}

function PrivacyEn() {
  return (
    <article>
      <h1>Privacy Policy</h1>
      <p className="text-sm text-zinc-500 dark:text-slate-400">Last updated: {LAST_UPDATED}</p>

      <h2>1. Who we are</h2>
      <p>
        Wroket (&quot;we&quot;, &quot;our service&quot;) is a task management and calendar tool operated by{" "}
        <strong>[TO BE COMPLETED: legal entity name]</strong>, registered under number{" "}
        <strong>[TO BE COMPLETED: registration number]</strong>, with its head office at{" "}
        <strong>[TO BE COMPLETED: full postal address]</strong>. The data controller within the meaning of GDPR is the entity above.
        For any data protection question, contact us at <a href="mailto:privacy@wroket.com">privacy@wroket.com</a>.
      </p>

      <h2>2. Data we collect</h2>
      <h3>2.1 Account information</h3>
      <ul>
        <li>Email address, first name, last name (entered at sign-up or imported via Google / Microsoft SSO).</li>
        <li>Password stored as a hash (never in plaintext) if you create a password-based account.</li>
        <li>OAuth technical identifiers (Google `sub`, Microsoft `oid`) to link your account to your identity provider.</li>
      </ul>

      <h3>2.2 Data provided by Google (via OAuth)</h3>
      <p>If you use Google SSO or connect Google Calendar, we access the following data with your explicit consent:</p>
      <ul>
        <li>
          <strong>Google profile (`openid email profile`)</strong>: Google account ID, email, name, profile picture.
          Used only to create / authenticate your Wroket account.
        </li>
        <li>
          <strong>Calendar read (`calendar.readonly`)</strong>: titles, dates, durations and free/busy status of events
          from the Google calendars you explicitly selected. Used to display your busy slots inside Wroket&apos;s Agenda view
          and suggest free slots for your tasks.
        </li>
        <li>
          <strong>Calendar write (`calendar.events`)</strong>: used only to push to your Google Calendar the Wroket time
          slots you explicitly chose to sync, and to create a Google Meet on demand. We never write any event without
          explicit user action.
        </li>
      </ul>

      <h3>2.3 Application data</h3>
      <ul>
        <li>Tasks, projects, phases, subtasks, tags, notes, attachments you create in Wroket.</li>
        <li>Preferences (language, theme, connected calendars, default calendar).</li>
        <li>Invitations sent / received, team memberships, comments.</li>
      </ul>

      <h3>2.4 Technical data</h3>
      <ul>
        <li>IP address, browser type, API access logs (kept for at most 90 days for security and debugging).</li>
        <li>Strictly necessary cookies (session cookie `auth_token`, language preference, theme preference). No advertising or third-party tracking cookies.</li>
      </ul>

      <h2>3. Purposes and legal bases</h2>
      <ul>
        <li>Service delivery (performance of contract): account creation, task and calendar management, Calendar synchronization.</li>
        <li>Security (legitimate interest): logs, abuse detection.</li>
        <li>Transactional communication (performance of contract): verification emails, password resets, invitation notifications.</li>
        <li>Service improvement (legitimate interest): aggregated and anonymized statistics.</li>
      </ul>

      <h2>4. Google API Services User Data Policy compliance</h2>
      <p>
        Wroket&apos;s use and transfer to any other app of information received from Google APIs will adhere to the{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer noopener">
          Google API Services User Data Policy
        </a>, including the <strong>Limited Use</strong> requirements.
      </p>
      <p>Specifically, data obtained from Google Calendar:</p>
      <ul>
        <li>is used solely to provide and improve user-facing calendar features visible directly to the user;</li>
        <li>is never transferred to third parties, except processors strictly necessary for operations (Google Cloud hosting) or as required by law;</li>
        <li>is never used for advertising targeting, resale, or to train generalized AI / machine learning models;</li>
        <li>is not read by humans, except with explicit consent, for narrow user-requested support, or to comply with applicable law.</li>
      </ul>

      <h2>5. Data sharing</h2>
      <p>We do not sell your data. We share only with:</p>
      <ul>
        <li><strong>Google Cloud Platform</strong> (hosting sub-processor, EU region: Belgium / Netherlands), for infrastructure execution.</li>
        <li><strong>Transactional email provider</strong>: [TO BE COMPLETED: email provider name].</li>
        <li>Authorities, only upon legal request.</li>
      </ul>

      <h2>6. Retention</h2>
      <ul>
        <li>Account data: as long as the account is active. Permanently deleted within 30 days after your request.</li>
        <li>Google Calendar data: not stored persistently beyond what is needed (short-term cache for agenda display). OAuth tokens are encrypted at rest and automatically revoked when you disconnect your calendar.</li>
        <li>Technical logs: at most 90 days.</li>
        <li>Backups: at most 30 days.</li>
      </ul>

      <h2>7. Security</h2>
      <ul>
        <li>Encryption in transit (TLS 1.2+) and at rest for sensitive data, including Google OAuth tokens.</li>
        <li>Strict access control: only application service accounts can read / write to the database.</li>
        <li>Passwords stored as a hash resistant to brute-force attacks.</li>
      </ul>

      <h2>8. Your rights (GDPR)</h2>
      <p>Under GDPR, you have the following rights:</p>
      <ul>
        <li>Access, rectification, deletion of your data.</li>
        <li>Portability (export of your tasks in JSON / CSV).</li>
        <li>Opposition and restriction of processing.</li>
        <li>Withdrawal of consent at any time (including revoking Google access from <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer noopener">your Google Account</a>).</li>
        <li>Filing a complaint with a supervisory authority (in Belgium: Data Protection Authority; in France: CNIL).</li>
      </ul>
      <p>
        To exercise these rights: <a href="mailto:privacy@wroket.com">privacy@wroket.com</a>. We will reply within one month.
      </p>

      <h2>9. International transfers</h2>
      <p>
        Your data is hosted in the EU. If a non-EU transfer becomes necessary (support, third-party sub-processor),
        it will be governed by the European Commission&apos;s Standard Contractual Clauses.
      </p>

      <h2>10. Minors</h2>
      <p>Wroket is not intended for users under 16. We do not knowingly collect data from minors.</p>

      <h2>11. Changes to this policy</h2>
      <p>
        Any material change will be notified by email at least 15 days before taking effect. This policy may also receive
        minor updates without notification (editorial fixes).
      </p>

      <h2>12. Contact</h2>
      <p>
        For any question about this policy: <a href="mailto:privacy@wroket.com">privacy@wroket.com</a>.
      </p>
    </article>
  );
}
