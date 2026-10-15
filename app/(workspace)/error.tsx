'use client';
export default function ErrorBoundary({reset}:{reset:()=>void}){return <section className="notice"><h1>Esta seção não carregou.</h1><p>Tente novamente. Sua conexão e seus dados permanecem armazenados.</p><button onClick={reset}>Tentar novamente</button><a href="/dashboard">Voltar ao dashboard</a></section>;}
