export default function LoadingRun() {
  return (
    <main id="main-content" className="report-page report-loading" aria-busy="true" aria-label="Loading validation report">
      <div className="page-shell">
        <div className="report-loading__bar" />
        <div className="report-loading__bar report-loading__title" />
        <div className="report-loading__grid">
          <div className="report-loading__block" />
          <div className="report-loading__block" />
        </div>
      </div>
    </main>
  );
}
