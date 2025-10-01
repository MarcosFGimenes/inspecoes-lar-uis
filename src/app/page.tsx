export default function Page() {
  return (
    <main className="p-8 space-y-4">
      <h1 className="text-2xl font-bold">Inspeções Lar — Dev</h1>
      <ul className="list-disc pl-6 space-y-2">
        <li><a className="text-blue-600 underline" href="/login">Login Mantenedor</a></li>
        <li><a className="text-blue-600 underline" href="/home">Home (Mantenedor)</a></li>
        <li><a className="text-blue-600 underline" href="/admin/login">Login Admin (PCM)</a></li>
        <li><a className="text-blue-600 underline" href="/admin/dashboard">Dashboard Admin</a></li>
      </ul>
    </main>
  );
}
