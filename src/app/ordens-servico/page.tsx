import { ListaOrdens } from "@/components/ListaOrdens";
import { fetchWorkOrdersByStatusSSR } from "@/services/firestore";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OrdensServicoPage() {
  const [scheduled, completed] = await Promise.all([
    fetchWorkOrdersByStatusSSR("scheduled"),
    fetchWorkOrdersByStatusSSR("completed"),
  ]);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Ordens de Serviço</h1>
        <p className="text-sm text-gray-600">
          Acompanhe as manutenções agendadas e conclua intervenções sem perder o contexto da lista.
        </p>
      </div>
      {/* TODO: Ajustar breadcrumbs de acordo com a navegação existente. */}
      <ListaOrdens scheduled={scheduled} completed={completed} />
    </main>
  );
}
