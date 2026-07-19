import { useT } from "../lib/i18n";

const REPOSITORY_URL = "https://github.com/armesha/shorts";

export default function AuthOpenSourceLink() {
  const { t } = useT();

  return (
    <p className="auth-open-source">
      <a className="auth-open-source__link" href={REPOSITORY_URL} target="_blank" rel="noreferrer">
        {t("auth.openSourceLicense")}
      </a>
    </p>
  );
}
