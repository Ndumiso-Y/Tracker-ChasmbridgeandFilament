export function SectionHeader({ eyebrow, title, copy }) {
  return (
    <div className="mb-6 max-w-4xl">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h2 className="mt-2 text-2xl font-black leading-tight text-navy md:text-4xl">{title}</h2>
      {copy && <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 md:text-base">{copy}</p>}
    </div>
  );
}
export default SectionHeader;
