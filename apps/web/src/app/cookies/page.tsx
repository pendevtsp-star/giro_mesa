import { CookiePreferenceReset } from "../../components/CookiePreferenceReset";
import { PublicLegalPage } from "../../components/PublicLegalPage";

export default function CookiesPage() {
  return (
    <PublicLegalPage
      title="Cookies"
      summary="Preferências de recursos essenciais, analytics e marketing."
    >
      <p>
        Cookies estritamente necessários permanecem ativos para segurança e sessão. Recursos
        opcionais só podem ser ativados após escolha e podem ser revogados a qualquer momento.
      </p>
      <CookiePreferenceReset />
    </PublicLegalPage>
  );
}
