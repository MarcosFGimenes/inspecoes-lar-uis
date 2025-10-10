import { use } from "react";

import MaintainerForm from "../_components/maintainer-form";

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default function MaintainerEditPage({ params }: PageProps) {
  const { id } = use(params);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      <MaintainerForm mode="edit" maintainerId={id} />
    </div>
  );
}
