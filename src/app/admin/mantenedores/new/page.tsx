import MaintainerForm from "../_components/maintainer-form";

export default function NewMaintainerPage() {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      <MaintainerForm mode="create" />
    </div>
  );
}
