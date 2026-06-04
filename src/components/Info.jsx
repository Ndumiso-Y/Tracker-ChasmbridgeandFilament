export function Info({ label, value }) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <div className="mt-1 leading-6 text-slate-700">{value}</div>
    </div>
  );
}
export default Info;
