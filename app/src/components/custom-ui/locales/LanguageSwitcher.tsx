import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEffect } from "react";

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation("common");

  // Sync language with localStorage
  const currentLanguage = i18n.language || "en";

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
    localStorage.setItem("i18nextLng", lng);
  };

  useEffect(() => {
    const savedLng = localStorage.getItem("i18nextLng");
    if (savedLng && savedLng !== currentLanguage) {
      i18n.changeLanguage(savedLng);
    }
  }, [i18n, currentLanguage]);

  return (
    <>
      <DropdownMenuTrigger>
        <Button variant="ghost" size="icon" aria-label={t("language")}>
          <Languages className="h-5 w-5" />
          <span className="sr-only">{t("language")}</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuItem
            onClick={() => changeLanguage("en")}
            className={currentLanguage === "en" ? "bg-accent" : ""}
          >
            {t("english")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => changeLanguage("vi")}
            className={currentLanguage === "vi" ? "bg-accent" : ""}
          >
            {t("vietnamese")}
          </DropdownMenuItem>
        </DropdownMenu>
      </DropdownMenuTrigger>
    </>
  );
}
