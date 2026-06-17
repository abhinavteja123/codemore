import Link from "next/link";

interface Props {
  title: string;
  description: string;
  href: string;
}

export default function NextStep({ title, description, href }: Props) {
  const external = href.startsWith("http");
  const className = "next-step-card";
  const head = "Next →";
  const inner = (
    <>
      <div className="next-step-head">{head}</div>
      <div className="next-step-title">{title}</div>
      <div className="next-step-desc">{description}</div>
    </>
  );
  if (external) {
    return (
      <a className={className} href={href} target="_blank" rel="noreferrer">
        {inner}
      </a>
    );
  }
  return (
    <Link className={className} href={href}>
      {inner}
    </Link>
  );
}
