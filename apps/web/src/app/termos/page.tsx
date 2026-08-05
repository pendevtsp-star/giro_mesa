import { PublicLegalPage } from "../../components/PublicLegalPage";
import { publicLegalDocuments } from "../../features/legal/public-documents";

export default function TermsPage() {
  const document = publicLegalDocuments.terms;

  return (
    <PublicLegalPage title={document.title} summary={document.summary}>
      <p className="legal-document-meta">
        Minuta {document.version} · SHA-256 {document.hash}
      </p>
      {document.sections.map((section) => (
        <section className="legal-document-section" key={section.heading}>
          <h2>{section.heading}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </section>
      ))}
    </PublicLegalPage>
  );
}
