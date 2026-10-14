'use client';
export default function ErrorPage({ reset }: { reset: () => void }) { return <main className="shell intro"><h1>Não foi possível carregar a página.</h1><button onClick={reset}>Tentar novamente</button></main>; }
