"use client";

import Link from "next/link";

import { useLocale } from "@/lib/LocaleContext";

/**
 * Bilingual Terms of Service.
 *
 * IMPORTANT before publication / Google OAuth verification:
 * - Replace every "[À COMPLÉTER ...]" / "[TO BE COMPLETED ...]" placeholder
 *   with the real legal entity, postal address, and governing law / court.
 * - Pricing / billing terms are summarized here and detailed on the /pricing page.
 */
export default function TermsPage() {
  const { locale } = useLocale();
  const isFr = locale === "fr";

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-zinc-900 dark:text-slate-100">
      <header className="border-b border-zinc-100 dark:border-slate-800">
        <div className="max-w-3xl mx-auto px-6 py-6 flex items-center justify-between">
          <Link href="/" className="text-sm font-semibold text-zinc-700 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400">
            ← Wroket
          </Link>
          <Link href="/privacy" className="text-sm text-zinc-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400">
            {isFr ? "Politique de confidentialité" : "Privacy policy"}
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 prose prose-zinc dark:prose-invert">
        {isFr ? <TermsFr /> : <TermsEn />}
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
            <Link href="/privacy" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
              {isFr ? "Confidentialité" : "Privacy"}
            </Link>
            <a href="mailto:team@wroket.com" className="hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors">
              team@wroket.com
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

const LAST_UPDATED = "2026-05-26";

function TermsFr() {
  return (
    <article>
      <h1>Conditions générales d&apos;utilisation</h1>
      <p className="text-sm text-zinc-500 dark:text-slate-400">Dernière mise à jour : {LAST_UPDATED}</p>

      <h2>1. Acceptation</h2>
      <p>
        Les présentes Conditions Générales d&apos;Utilisation (« CGU ») régissent l&apos;accès et l&apos;utilisation du service Wroket
        (« le Service ») édité par <strong>[À COMPLÉTER : raison sociale]</strong>, immatriculée sous le numéro{" "}
        <strong>[À COMPLÉTER : n° d&apos;entreprise]</strong>, dont le siège est situé{" "}
        <strong>[À COMPLÉTER : adresse complète]</strong>. En créant un compte ou en utilisant le Service, vous acceptez sans réserve les présentes CGU.
      </p>

      <h2>2. Description du service</h2>
      <p>
        Wroket est un outil de gestion de tâches, de projets et d&apos;agenda, accessible via un navigateur web. Il propose notamment :
        vue Radar de priorisation, agenda intelligent avec connexion à Google Calendar et Microsoft Outlook, projets et phases,
        bloc-notes, équipes, et notifications. La liste détaillée des fonctionnalités est susceptible d&apos;évoluer.
      </p>

      <h2>3. Compte utilisateur</h2>
      <h3>3.1 Création</h3>
      <p>
        L&apos;inscription est ouverte à toute personne âgée d&apos;au moins 16 ans, agissant en son nom propre ou au nom de son employeur.
        Vous vous engagez à fournir des informations exactes et à les maintenir à jour.
      </p>
      <h3>3.2 Sécurité du compte</h3>
      <p>
        Vous êtes responsable de la confidentialité de vos identifiants. Toute action effectuée depuis votre compte est réputée
        avoir été effectuée par vous. Avertissez-nous sans délai à <a href="mailto:security@wroket.com">security@wroket.com</a> en
        cas de soupçon d&apos;accès non autorisé.
      </p>
      <h3>3.3 Suspension et résiliation</h3>
      <p>
        Vous pouvez supprimer votre compte à tout moment depuis vos paramètres. Nous pouvons suspendre ou résilier un compte en cas
        de manquement aux présentes CGU, de fraude, d&apos;utilisation abusive ou de risque pour la sécurité du Service.
      </p>

      <h2>4. Utilisation acceptable</h2>
      <p>Vous vous engagez à ne pas :</p>
      <ul>
        <li>utiliser le Service à des fins illégales ou nuisibles ;</li>
        <li>tenter d&apos;accéder à des comptes ou données qui ne vous appartiennent pas ;</li>
        <li>contourner les mesures de sécurité, scraper massivement, lancer des attaques par déni de service ;</li>
        <li>téléverser du contenu illicite, contrefaisant, diffamatoire ou portant atteinte à la vie privée d&apos;autrui ;</li>
        <li>revendre ou réexposer le Service sans autorisation écrite.</li>
      </ul>

      <h2>5. Contenu utilisateur</h2>
      <p>
        Vous conservez la propriété de toutes les données que vous saisissez dans Wroket (tâches, projets, notes, pièces jointes). Vous nous
        accordez une licence strictement limitée et non exclusive pour héberger, traiter et afficher ces données dans le seul but de fournir le Service.
        Vous pouvez exporter vos données à tout moment et demander leur suppression définitive.
      </p>

      <h2>6. Services tiers (Google, Microsoft)</h2>
      <p>
        Wroket s&apos;intègre à Google Calendar et Microsoft Outlook pour les fonctionnalités d&apos;agenda. Ces intégrations sont activées
        uniquement avec votre consentement OAuth explicite et peuvent être révoquées à tout moment depuis votre compte fournisseur
        ou depuis Wroket. L&apos;utilisation de ces services est régie par les conditions et politiques de Google / Microsoft, sur
        lesquelles nous n&apos;avons aucun contrôle.
      </p>

      <h2>7. Tarifs, abonnement et facturation</h2>
      <p>
        Les plans, prix et conditions de facturation sont décrits sur la page <Link href="/pricing">Tarifs</Link>. Sauf indication
        contraire, les abonnements sont mensuels ou annuels, renouvelés tacitement à l&apos;échéance, et résiliables à tout moment
        avec effet à la fin de la période en cours. Aucun remboursement n&apos;est accordé pour les périodes déjà entamées, sauf
        obligation légale contraire (notamment droit de rétractation pour les consommateurs UE).
      </p>

      <h2>8. Propriété intellectuelle</h2>
      <p>
        Le logiciel, le code source, la marque « Wroket », le logo et tous les éléments graphiques restent la propriété exclusive
        de l&apos;éditeur. Les présentes CGU ne confèrent aucun droit de reproduction ou de modification au-delà de l&apos;usage strict
        du Service.
      </p>

      <h2>9. Disponibilité et garantie</h2>
      <p>
        Le Service est fourni « en l&apos;état », sans garantie de disponibilité continue ni d&apos;absence d&apos;erreur. Nous mettons en
        œuvre des moyens raisonnables pour maintenir une haute disponibilité et la sécurité des données. Aucune garantie
        d&apos;adéquation à un usage particulier n&apos;est accordée au-delà de ce qui est requis par la loi.
      </p>

      <h2>10. Limitation de responsabilité</h2>
      <p>
        Dans la limite autorisée par la loi applicable, notre responsabilité globale au titre des présentes est limitée au
        montant des sommes effectivement payées par vous au cours des douze (12) derniers mois précédant le fait générateur. Nous
        ne sommes pas responsables des dommages indirects, perte de profit, perte de données réelle ou supposée, sauf faute
        lourde ou dol. Les droits des consommateurs prévus par la loi restent applicables.
      </p>

      <h2>11. Indemnisation</h2>
      <p>
        Vous acceptez de nous indemniser contre toute réclamation de tiers résultant de votre utilisation du Service en violation
        des CGU ou de la loi, dans la limite autorisée par la loi applicable.
      </p>

      <h2>12. Durée et résiliation</h2>
      <p>
        Les CGU s&apos;appliquent tant que vous utilisez le Service. La résiliation pour quelque motif que ce soit met fin à
        votre droit d&apos;accès, mais les dispositions destinées à survivre (propriété intellectuelle, limitation de responsabilité,
        loi applicable) restent en vigueur.
      </p>

      <h2>13. Modifications</h2>
      <p>
        Nous pouvons mettre à jour les présentes CGU pour refléter l&apos;évolution du Service ou de la législation. Toute
        modification substantielle vous sera notifiée par e-mail au moins 15 jours avant son entrée en vigueur ; l&apos;utilisation
        continue du Service vaut acceptation.
      </p>

      <h2>14. Loi applicable et juridiction</h2>
      <p>
        Les présentes CGU sont régies par le droit <strong>[À COMPLÉTER : pays / droit applicable]</strong>. Tout litige relève de
        la compétence exclusive des tribunaux de <strong>[À COMPLÉTER : ville / juridiction]</strong>, sous réserve des dispositions
        impératives applicables aux consommateurs (qui peuvent saisir les tribunaux de leur lieu de résidence).
      </p>

      <h2>15. Contact</h2>
      <p>
        Pour toute question relative aux présentes CGU : <a href="mailto:team@wroket.com">team@wroket.com</a>.
      </p>
    </article>
  );
}

function TermsEn() {
  return (
    <article>
      <h1>Terms of Service</h1>
      <p className="text-sm text-zinc-500 dark:text-slate-400">Last updated: {LAST_UPDATED}</p>

      <h2>1. Acceptance</h2>
      <p>
        These Terms of Service (&quot;Terms&quot;) govern access to and use of the Wroket service (&quot;the Service&quot;)
        operated by <strong>[TO BE COMPLETED: legal entity name]</strong>, registered under number{" "}
        <strong>[TO BE COMPLETED: registration number]</strong>, with its head office at{" "}
        <strong>[TO BE COMPLETED: full postal address]</strong>. By creating an account or using the Service, you accept these Terms without reservation.
      </p>

      <h2>2. Service description</h2>
      <p>
        Wroket is a task, project and calendar management tool, accessible via a web browser. It includes among others:
        priority Radar view, smart agenda with Google Calendar and Microsoft Outlook integration, projects and phases,
        notes, teams, and notifications. The detailed feature set is subject to evolution.
      </p>

      <h2>3. User account</h2>
      <h3>3.1 Sign-up</h3>
      <p>
        Sign-up is open to any individual at least 16 years old, acting in their own name or on behalf of their employer.
        You undertake to provide accurate information and to keep it up to date.
      </p>
      <h3>3.2 Account security</h3>
      <p>
        You are responsible for the confidentiality of your credentials. Any action taken from your account is deemed
        performed by you. Notify us immediately at <a href="mailto:security@wroket.com">security@wroket.com</a> in case of
        suspected unauthorized access.
      </p>
      <h3>3.3 Suspension and termination</h3>
      <p>
        You may delete your account at any time from your settings. We may suspend or terminate an account in case of breach
        of these Terms, fraud, abuse, or security risk to the Service.
      </p>

      <h2>4. Acceptable use</h2>
      <p>You undertake not to:</p>
      <ul>
        <li>use the Service for unlawful or harmful purposes;</li>
        <li>attempt to access accounts or data that do not belong to you;</li>
        <li>bypass security controls, mass-scrape, or launch denial-of-service attacks;</li>
        <li>upload illegal, infringing, defamatory content or content that violates others&apos; privacy;</li>
        <li>resell or re-expose the Service without prior written authorization.</li>
      </ul>

      <h2>5. User content</h2>
      <p>
        You retain ownership of all data you enter into Wroket (tasks, projects, notes, attachments). You grant us a strictly
        limited, non-exclusive license to host, process and display this data solely to provide the Service. You may export
        your data at any time and request its permanent deletion.
      </p>

      <h2>6. Third-party services (Google, Microsoft)</h2>
      <p>
        Wroket integrates with Google Calendar and Microsoft Outlook for calendar functionality. These integrations are
        enabled only with your explicit OAuth consent and can be revoked at any time from your provider account or from
        Wroket. Use of these services is governed by the terms and policies of Google / Microsoft, over which we have no
        control.
      </p>

      <h2>7. Pricing, subscription and billing</h2>
      <p>
        Plans, prices and billing terms are described on the <Link href="/pricing">Pricing</Link> page. Unless otherwise
        stated, subscriptions are monthly or annual, automatically renewed at the end of each period, and cancellable at any
        time with effect at the end of the current period. No refund is granted for periods already started, except as
        required by law (in particular EU consumer right of withdrawal).
      </p>

      <h2>8. Intellectual property</h2>
      <p>
        The software, source code, &quot;Wroket&quot; brand, logo, and all graphic elements remain the exclusive property of
        the operator. These Terms do not grant any reproduction or modification right beyond strict use of the Service.
      </p>

      <h2>9. Availability and warranty</h2>
      <p>
        The Service is provided &quot;as is&quot;, without warranty of continuous availability or error-free operation. We
        deploy reasonable means to maintain high availability and data security. No warranty of fitness for a particular
        purpose is granted beyond what is required by law.
      </p>

      <h2>10. Limitation of liability</h2>
      <p>
        To the extent permitted by applicable law, our total liability under these Terms is limited to the amount actually
        paid by you in the twelve (12) months preceding the triggering event. We are not liable for indirect damages, lost
        profit, or actual or alleged data loss, except in case of gross negligence or willful misconduct. Statutory consumer
        rights remain applicable.
      </p>

      <h2>11. Indemnification</h2>
      <p>
        You agree to indemnify us against any third-party claim resulting from your use of the Service in violation of these
        Terms or the law, to the extent permitted by applicable law.
      </p>

      <h2>12. Term and termination</h2>
      <p>
        These Terms apply for as long as you use the Service. Termination for any reason ends your access right, but
        provisions intended to survive (intellectual property, limitation of liability, governing law) remain in force.
      </p>

      <h2>13. Changes</h2>
      <p>
        We may update these Terms to reflect changes to the Service or to the law. Any material change will be notified by
        email at least 15 days before taking effect; continued use of the Service constitutes acceptance.
      </p>

      <h2>14. Governing law and jurisdiction</h2>
      <p>
        These Terms are governed by the laws of <strong>[TO BE COMPLETED: country / applicable law]</strong>. Any dispute is
        within the exclusive jurisdiction of the courts of <strong>[TO BE COMPLETED: city / jurisdiction]</strong>, subject
        to mandatory consumer protection rules (consumers may bring proceedings in the courts of their place of residence).
      </p>

      <h2>15. Contact</h2>
      <p>
        For any question about these Terms: <a href="mailto:team@wroket.com">team@wroket.com</a>.
      </p>
    </article>
  );
}
