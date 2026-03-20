import { IssueCategory } from "@/lib/types";
import {
  Bug,
  AlertTriangle,
  Gauge,
  Shield,
  Wrench,
  Accessibility,
  Star,
} from "lucide-react";

const icons: Record<IssueCategory, React.ReactNode> = {
  bug: <Bug size={12} />,
  "code-smell": <AlertTriangle size={12} />,
  performance: <Gauge size={12} />,
  security: <Shield size={12} />,
  maintainability: <Wrench size={12} />,
  accessibility: <Accessibility size={12} />,
  "best-practice": <Star size={12} />,
};

export default function CategoryBadge({
  category,
}: {
  category: IssueCategory;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-surface-700 px-2 py-0.5 text-[10px] capitalize text-surface-200">
      {icons[category]}
      {category.replace("-", " ")}
    </span>
  );
}
