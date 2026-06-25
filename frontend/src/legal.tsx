import { useEffect } from "react";
import { Utensils } from "lucide-react";

export type LegalPageKind = "impressum" | "datenschutz";

const privacyEmail = "johannes_blank2001@gmx.de";

export function legalPageFromPath(pathname: string): LegalPageKind | null {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/";
  if (normalizedPath === "/impressum") return "impressum";
  if (normalizedPath === "/datenschutz") return "datenschutz";
  return null;
}

export function SiteFooter({ className = "" }: { className?: string }) {
  const currentPage =
    typeof window === "undefined"
      ? null
      : legalPageFromPath(window.location.pathname);

  return (
    <footer className={`site-footer ${className}`.trim()}>
      <div className="site-footer-inner">
        <span>© 2026 MealPilots</span>
        <span className="site-footer-link-group">
          <span className="site-footer-separator" aria-hidden="true">
            ·
          </span>
          <a
            href="/impressum"
            aria-current={currentPage === "impressum" ? "page" : undefined}
          >
            Impressum
          </a>
        </span>
        <span className="site-footer-link-group">
          <span className="site-footer-separator" aria-hidden="true">
            ·
          </span>
          <a
            href="/datenschutz"
            aria-current={currentPage === "datenschutz" ? "page" : undefined}
          >
            Datenschutz
          </a>
        </span>
      </div>
    </footer>
  );
}

export function LegalPage({ page }: { page: LegalPageKind }) {
  useEffect(() => {
    document.title =
      page === "impressum"
        ? "Impressum · MealPilots"
        : "Datenschutzerklärung · MealPilots";
  }, [page]);

  return (
    <div className="legal-shell">
      <header className="legal-header">
        <a className="legal-brand" href="/" aria-label="Zur MealPilots-Startseite">
          <Utensils size={24} aria-hidden="true" />
          <span>MealPilot</span>
        </a>
      </header>

      <main className="legal-page">
        <article className="legal-card">
          {page === "impressum" ? <ImprintContent /> : <PrivacyContent />}
        </article>
      </main>

      <SiteFooter />
    </div>
  );
}

function ImprintContent() {
  return (
    <>
      <p className="eyebrow">Rechtliche Informationen</p>
      <h1>Impressum</h1>

      <section>
        <h2>Angaben gemäß § 5 DDG</h2>
        <address>
          <strong>Johannes Blank</strong>
          <br />
          Weidmannstraße 6
          <br />
          80997 München
          <br />
          Deutschland
        </address>
      </section>

      <section>
        <h2>Kontakt</h2>
        <p>
          E-Mail:{" "}
          <a href={`mailto:${privacyEmail}`}>{privacyEmail}</a>
        </p>
      </section>

      <section>
        <h2>Hinweis zum Projekt</h2>
        <p>
          MealPilot ist ein privates Portfolio- und Demo-Projekt. Die
          vorstehenden Anbieterangaben gelten unabhängig von diesem
          Projektcharakter.
        </p>
      </section>
    </>
  );
}

function PrivacyContent() {
  return (
    <>
      <p className="eyebrow">Stand: 25. Juni 2026</p>
      <h1>Datenschutzerklärung</h1>

      <section>
        <h2>1. Verantwortlicher</h2>
        <address>
          <strong>Johannes Blank</strong>
          <br />
          Weidmannstraße 6
          <br />
          80997 München
          <br />
          Deutschland
          <br />
          E-Mail:{" "}
          <a href={`mailto:${privacyEmail}`}>{privacyEmail}</a>
        </address>
      </section>

      <section>
        <h2>2. Hosting und Server-Logdaten</h2>
        <p>
          Diese Website wird über Railway bereitgestellt. Beim Aufruf der
          Website werden technisch notwendige Verbindungsdaten an die
          Hosting-Infrastruktur übertragen. Dazu können insbesondere
          IP-Adresse, Datum und Uhrzeit des Zugriffs, aufgerufene Seite,
          Referrer-URL, Browser- und Betriebssysteminformationen,
          HTTP-Statuscode und übertragene Datenmenge gehören.
        </p>
        <p>
          Die Verarbeitung erfolgt, um die Website sicher, stabil und
          funktionsfähig bereitzustellen sowie technische Störungen und
          Missbrauch zu erkennen. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f
          DSGVO. Das berechtigte Interesse liegt im sicheren und zuverlässigen
          Betrieb des Angebots.
        </p>
        <p>
          Hosting-Anbieter ist die Railway Corporation, 548 Market St PMB
          68956, San Francisco, California 94104, USA. Weitere Informationen
          enthalten die{" "}
          <a
            href="https://railway.com/legal/privacy"
            target="_blank"
            rel="noreferrer"
          >
            Datenschutzhinweise von Railway
          </a>
          .
        </p>
      </section>

      <section>
        <h2>3. App- und Nutzungsdaten in Supabase</h2>
        <p>
          Für die Online-Datenhaltung nutzt MealPilot Supabase. Abhängig von
          der verwendeten Funktion können dort insbesondere Profilname und
          Profilkennung, Einstellungen, Wochenpläne, Rezept- und
          Planungsverlauf, Einkaufslistenstatus, Vorratsdaten sowie
          Demo-Nutzungsdaten gespeichert werden. Die Eingabe solcher Daten ist
          freiwillig; ohne sie stehen die jeweiligen Planungs- und
          Speicherfunktionen nicht oder nur eingeschränkt zur Verfügung.
        </p>
        <p>
          Die Verarbeitung dient der Bereitstellung der ausdrücklich genutzten
          App-Funktionen. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO,
          soweit die Verarbeitung zur Bereitstellung der angeforderten
          Funktionen erforderlich ist, sowie ergänzend Art. 6 Abs. 1 lit. f
          DSGVO für den sicheren und zuverlässigen Betrieb.
        </p>
        <p>
          Dienstanbieter ist Supabase, Inc., USA. Weitere Informationen
          enthalten die{" "}
          <a
            href="https://supabase.com/privacy"
            target="_blank"
            rel="noreferrer"
          >
            Datenschutzhinweise von Supabase
          </a>
          .
        </p>
      </section>

      <section>
        <h2>4. Anmeldung und lokaler Browser-Speicher</h2>
        <p>
          Bei geschützten Zugängen wird die eingegebene PIN an das
          MealPilot-Backend übertragen und dort geprüft. Nach erfolgreicher
          Anmeldung wird ein signiertes Sitzungstoken erzeugt. Im lokalen
          Speicher des Browsers (<code>localStorage</code>) speichert die App
          technisch notwendige Informationen, insbesondere Sitzungstoken,
          Profilkennung und Profilname sowie ausgewählte App-Einstellungen und
          lokale Anzeigepräferenzen.
        </p>
        <p>
          Diese Speicherung ist erforderlich, um den ausdrücklich gewünschten
          Login und die App-Funktionen bereitzustellen. Sie erfolgt auf
          Grundlage von § 25 Abs. 2 Nr. 2 TDDDG; die anschließende Verarbeitung
          personenbezogener Daten beruht auf Art. 6 Abs. 1 lit. b und lit. f
          DSGVO. MealPilot setzt keine Analyse-, Marketing- oder
          Werbe-Tracker ein.
        </p>
      </section>

      <section>
        <h2>5. Speicherdauer</h2>
        <p>
          Personenbezogene Daten werden nur so lange gespeichert, wie dies für
          den jeweiligen Zweck erforderlich ist oder gesetzliche
          Aufbewahrungspflichten bestehen. App-Daten bleiben grundsätzlich
          gespeichert, bis sie nicht mehr benötigt werden oder eine
          entsprechende Löschungsanfrage umgesetzt wird.
        </p>
        <p>
          Demo-Sitzungen sind 24 Stunden gültig. Demo-Daten, die älter als 48
          Stunden sind, werden beim nächsten Start einer Demo-Sitzung
          automatisch bereinigt. Sitzungs- und Profilzuordnungsdaten im Browser
          werden beim Logout entfernt. Andere lokale Anzeigepräferenzen bleiben
          bis zu ihrer funktionsbezogenen Aktualisierung oder zur manuellen
          Löschung der Website-Daten im Browser erhalten. Für technische
          Protokolldaten gelten die erforderlichen Speicherfristen der
          eingesetzten Hosting-Anbieter.
        </p>
      </section>

      <section>
        <h2>6. E-Mail-Kontakt</h2>
        <p>
          Bei einer Kontaktaufnahme per E-Mail werden die übermittelten Angaben
          verarbeitet, um die Anfrage zu bearbeiten. Rechtsgrundlage ist Art. 6
          Abs. 1 lit. b DSGVO bei vertrags- oder nutzungsbezogenen Anfragen,
          ansonsten Art. 6 Abs. 1 lit. f DSGVO. Das berechtigte Interesse liegt
          in der sachgerechten Beantwortung von Anfragen. Die Daten werden
          gelöscht, sobald die Anfrage abschließend bearbeitet ist und keine
          gesetzlichen Aufbewahrungspflichten entgegenstehen.
        </p>
      </section>

      <section>
        <h2>7. Empfänger und Drittlandübermittlung</h2>
        <p>
          Railway und Supabase verarbeiten Daten als technische Dienstleister.
          Beide Anbieter haben einen Sitz in den USA. Soweit Daten außerhalb
          des Europäischen Wirtschaftsraums verarbeitet werden, stützen die
          Anbieter die Übermittlung nach ihren Vertragsunterlagen insbesondere
          auf anwendbare Angemessenheitsbeschlüsse, das EU-US Data Privacy
          Framework und/oder die Standardvertragsklauseln der Europäischen
          Kommission.
        </p>
        <p>
          Weitere Einzelheiten enthalten das{" "}
          <a
            href="https://railway.com/legal/dpa"
            target="_blank"
            rel="noreferrer"
          >
            Data Processing Addendum von Railway
          </a>{" "}
          und das{" "}
          <a
            href="https://supabase.com/legal/dpa"
            target="_blank"
            rel="noreferrer"
          >
            Data Processing Addendum von Supabase
          </a>
          .
        </p>
      </section>

      <section>
        <h2>8. Rechte betroffener Personen</h2>
        <p>Betroffene Personen haben nach Maßgabe der DSGVO insbesondere das Recht auf:</p>
        <ul>
          <li>Auskunft über die verarbeiteten Daten (Art. 15 DSGVO),</li>
          <li>Berichtigung unrichtiger Daten (Art. 16 DSGVO),</li>
          <li>Löschung der Daten (Art. 17 DSGVO),</li>
          <li>Einschränkung der Verarbeitung (Art. 18 DSGVO),</li>
          <li>Datenübertragbarkeit (Art. 20 DSGVO) und</li>
          <li>Widerspruch gegen Verarbeitungen nach Art. 21 DSGVO.</li>
        </ul>
        <p>
          Zur Ausübung dieser Rechte genügt eine E-Mail an{" "}
          <a href={`mailto:${privacyEmail}`}>{privacyEmail}</a>.
        </p>
      </section>

      <section>
        <h2>9. Beschwerderecht</h2>
        <p>
          Es besteht das Recht, sich gemäß Art. 77 DSGVO bei einer
          Datenschutzaufsichtsbehörde zu beschweren. Für nichtöffentliche
          Stellen in Bayern ist insbesondere zuständig:
        </p>
        <address>
          Bayerisches Landesamt für Datenschutzaufsicht (BayLDA)
          <br />
          Promenade 18
          <br />
          91522 Ansbach
          <br />
          <a
            href="https://www.lda.bayern.de/de/beschwerde.html"
            target="_blank"
            rel="noreferrer"
          >
            Online-Beschwerde beim BayLDA
          </a>
        </address>
      </section>

      <section>
        <h2>10. Automatisierte Entscheidungen</h2>
        <p>
          Eine automatisierte Entscheidungsfindung einschließlich Profiling im
          Sinne von Art. 22 DSGVO findet nicht statt.
        </p>
      </section>
    </>
  );
}
