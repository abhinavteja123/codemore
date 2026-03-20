import { Severity } from "@/lib/types";

const colors: Record<Severity, string> = {
  BLOCKER: "bg-red-800 text-red-100",
  CRITICAL: "bg-red-600 text-white",
  MAJOR: "bg-orange-500 text-white",
  MINOR: "bg-blue-500 text-white",
  INFO: "bg-gray-500 text-white",
};

export default function SeverityBadge({
  severity,
  small,
}: {
  severity: Severity;
  small?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center rounded font-semibold uppercase ${colors[severity]} ${
        small ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-0.5 text-[10px]"
      }`}
    >
      {severity}
    </span>
  );
}
