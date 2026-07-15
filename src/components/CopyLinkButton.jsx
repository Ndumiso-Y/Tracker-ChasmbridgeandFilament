import { useState } from "react";
import { Link2 } from "lucide-react";
import { cx } from "../utils/cx";

export default function CopyLinkButton({ getUrl, label = "Copy Link", copiedLabel = "Link copied", className = "" }) {
  const [state, setState] = useState("idle");
  const [manualUrl, setManualUrl] = useState("");

  const copy = async (event) => {
    event.stopPropagation();
    const url = typeof getUrl === "function" ? getUrl() : getUrl;
    setManualUrl(url);
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
      setTimeout(() => setState("idle"), 2500);
    } catch {
      setState("manual");
    }
  };

  return (
    <span className="inline-flex max-w-full flex-col items-start gap-1">
      <button
        type="button"
        onClick={copy}
        aria-label={label}
        className={cx("inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:border-gold hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40", className)}
      >
        <Link2 size={13} aria-hidden="true" />
        {state === "copied" ? copiedLabel : label}
      </button>
      <span aria-live="polite" className="sr-only">{state === "copied" ? copiedLabel : ""}</span>
      {state === "manual" && (
        <input
          readOnly
          value={manualUrl}
          onClick={(event) => event.currentTarget.select()}
          className="w-full min-w-[220px] rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-900"
          aria-label="Copy this link manually"
        />
      )}
    </span>
  );
}
