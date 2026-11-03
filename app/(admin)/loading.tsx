export default function AdminLoading() {
  return (
    <div className="page-enter" aria-busy="true" aria-label="Loading page">
      <div className="mb-6 space-y-3">
        <div className="skeleton h-8 w-56" />
        <div className="skeleton h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="skeleton h-32 rounded-card" />
        ))}
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <div className="skeleton h-72 rounded-card xl:col-span-2" />
        <div className="skeleton h-72 rounded-card" />
      </div>
    </div>
  );
}
