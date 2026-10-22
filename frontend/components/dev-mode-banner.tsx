export default function DevModeBanner() {
  if (process.env.NEXT_PUBLIC_DEV_LOGIN !== "1") return null;
  return <div className="bg-teal-700 px-4 py-2 text-center text-sm font-semibold text-white">Development mode: login shortcuts are on.</div>;
}
