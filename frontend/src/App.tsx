function App() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <section className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-lg">
        <p className="text-sm font-semibold tracking-widest text-emerald-600">
          TavoloFlow
        </p>
        <h1 className="mt-3 text-3xl font-bold text-slate-900">
          Tailwind CSS Test
        </h1>
        <p className="mt-4 leading-relaxed text-slate-600">
          If you see a centered white card with rounded corners and a shadow,
          Tailwind CSS is working.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-sky-100 p-4 text-center font-medium text-sky-700">
            Colors
          </div>
          <div className="rounded-lg bg-violet-100 p-4 text-center font-medium text-violet-700">
            Spacing
          </div>
          <div className="rounded-lg bg-amber-100 p-4 text-center font-medium text-amber-700">
            Responsive
          </div>
        </div>

        <button
          type="button"
          className="mt-6 w-full cursor-pointer rounded-lg bg-emerald-600 px-5 py-3 font-medium text-white transition-colors hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
        >
          Hover to darken the button
        </button>
        <p className="mt-3 text-sm text-slate-500">
          Resize the window to switch between one and three columns.
        </p>
      </section>
    </main>
  );
}

export default App;
