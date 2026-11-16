import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";

const FONT = "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const FONTES = [
  { key: "contratos", nome: "Carteirinhas", tipo: "Carteirinha" },
  { key: "vendasExames", nome: "Exames", tipo: "Exame" },
  { key: "vendasConsultas", nome: "Consultas", tipo: "Consulta" },
  { key: "pagamentos", nome: "Pagamentos", tipo: "Pagamento" },
  { key: "agendamentos", nome: "Agendamentos", tipo: "Agendamento" },
  { key: "mensalidades", nome: "Mensalidades", tipo: "Mensalidade" },
];

const ABAS = [
  ["geral", "Visão geral"],
  ["consultas", "Consultas"],
  ["exames", "Exames"],
  ["carteirinhas", "Carteirinhas"],
  ["mensalidades", "Light Plus / ENEL / EDP"],
  ["clinicas", "Clínicas e custos"],
  ["pagamentos", "Formas de pagamento"],
];

const CAMPOS_DATA = ["dataPagamento", "pagoEm", "dataRecebimento", "dataVenda", "createdAt", "criadoEm", "data", "dataAgendamento", "vencimento"];
const CAMPOS_VALOR = ["valorPago", "valorRecebido", "valorTotal", "valor", "total", "preco", "valorVenda"];

function primeiro(obj, campos, padrao = "") {
  for (const campo of campos) {
    const valor = campo.split(".").reduce((acc, parte) => acc?.[parte], obj);
    if (valor !== undefined && valor !== null && valor !== "") return valor;
  }
  return padrao;
}

function numero(valor) {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;
  if (typeof valor === "string") {
    const limpo = valor.replace(/R\$\s?/g, "").replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
    const n = Number(limpo);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function dataJS(valor) {
  if (!valor) return null;
  if (typeof valor?.toDate === "function") return valor.toDate();
  if (valor instanceof Date) return valor;
  if (typeof valor === "number") return new Date(valor);
  if (typeof valor === "string") {
    const d = new Date(valor.length === 10 ? `${valor}T12:00:00` : valor);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (valor?.seconds) return new Date(valor.seconds * 1000);
  return null;
}

function moeda(valor) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor || 0);
}

function statusPagamento(registro) {
  return String(primeiro(registro, ["statusPagamento", "situacaoPagamento", "status", "situacao"], "Não identificado"));
}

function estaPago(registro) {
  const status = statusPagamento(registro).toLowerCase();
  return registro.pagamentoConfirmado === true || registro.pago === true || ["pago", "aprovado", "confirmado", "recebido", "paid", "succeeded", "concluido", "concluído"].some((s) => status.includes(s));
}

function modalidade(registro) {
  return String(primeiro(registro, ["modalidade", "concessionaria", "empresa", "produto", "planoNome", "plano", "origem", "tipoRegistro"], "Não identificada"));
}

function nomeCliente(registro) {
  return String(primeiro(registro, ["clienteNome", "nomeCliente", "titular", "nome", "cliente.nome", "beneficiario.nome"], "Não informado"));
}

function dataRegistro(registro) {
  return dataJS(primeiro(registro, CAMPOS_DATA, null));
}

function valorRegistro(registro) {
  return numero(primeiro(registro, CAMPOS_VALOR, 0));
}

function baixarCSV(nome, linhas) {
  if (!linhas.length) {
    window.alert("Não há registros para exportar com os filtros selecionados.");
    return;
  }
  const colunas = Object.keys(linhas[0]);
  const escapar = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const conteudo = "\uFEFF" + [colunas.map(escapar).join(";"), ...linhas.map((linha) => colunas.map((c) => escapar(linha[c])).join(";"))].join("\r\n");
  const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${nome}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function Relatorios({ usuario }) {
  const [dados, setDados] = useState({});
  const [erros, setErros] = useState({});
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState("geral");
  const [inicio, setInicio] = useState(() => `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`);
  const [fim, setFim] = useState(() => new Date().toISOString().slice(0, 10));
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [busca, setBusca] = useState("");

  useEffect(() => {
    const cancelamentos = FONTES.map((fonte) => onSnapshot(
      collection(db, fonte.key),
      (snapshot) => {
        setDados((atual) => ({ ...atual, [fonte.key]: snapshot.docs.map((d) => ({ id: d.id, ...d.data(), __colecao: fonte.key, __tipo: fonte.tipo })) }));
        setErros((atual) => ({ ...atual, [fonte.key]: "" }));
      },
      (erro) => {
        console.error(`Erro ao consultar ${fonte.key}:`, erro);
        setErros((atual) => ({ ...atual, [fonte.key]: erro.code === "permission-denied" ? "Sem permissão de leitura no Firestore." : erro.message }));
      }
    ));
    return () => cancelamentos.forEach((cancelar) => cancelar());
  }, [usuario]);

  useEffect(() => {
    const timer = window.setTimeout(() => setCarregando(false), 900);
    return () => window.clearTimeout(timer);
  }, []);

  const registros = useMemo(() => FONTES.flatMap((f) => dados[f.key] || []), [dados]);
  const filtrados = useMemo(() => {
    const de = inicio ? new Date(`${inicio}T00:00:00`) : null;
    const ate = fim ? new Date(`${fim}T23:59:59.999`) : null;
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    return registros.filter((r) => {
      const d = dataRegistro(r);
      if (de && d && d < de) return false;
      if (ate && d && d > ate) return false;
      if (filtroStatus === "pagos" && !estaPago(r)) return false;
      if (filtroStatus === "pendentes" && estaPago(r)) return false;
      if (termo && ![nomeCliente(r), r.id, modalidade(r), primeiro(r, ["clinicaNome", "clinica", "especialidade", "procedimento", "descricao", "formaPagamento", "metodoPagamento"], "")].join(" ").toLocaleLowerCase("pt-BR").includes(termo)) return false;
      return true;
    });
  }, [registros, inicio, fim, filtroStatus, busca]);

  const porTipo = (tipo) => filtrados.filter((r) => r.__tipo === tipo);
  const vendas = filtrados.filter((r) => ["Carteirinha", "Exame", "Consulta"].includes(r.__tipo));
  const pagamentos = porTipo("Pagamento");
  const totalVendido = vendas.reduce((s, r) => s + valorRegistro(r), 0);
  // Recebimento é apurado na coleção pagamentos para não somar novamente o valor da venda.
  const totalRecebido = pagamentos.filter(estaPago).reduce((s, r) => s + valorRegistro(r), 0);
  const totalPendente = pagamentos.filter((r) => !estaPago(r)).reduce((s, r) => s + valorRegistro(r), 0) + vendas.filter((r) => !estaPago(r) && !pagamentos.some((p) => String(primeiro(p, ["vendaId", "contratoId", "idVenda", "referenciaId"], "")) === r.id)).reduce((s, r) => s + valorRegistro(r), 0);
  const custos = filtrados.reduce((s, r) => s + numero(primeiro(r, ["custoClinica", "valorCusto", "custo", "valorRepasse", "repasseClinica"], 0)), 0);
  const resultado = totalRecebido - custos;

  const linhasCSV = filtrados.map((r) => {
    const d = dataRegistro(r);
    return {
      id: r.id,
      colecao: r.__colecao,
      tipo: r.__tipo,
      data: d ? d.toLocaleDateString("pt-BR") : "",
      cliente: nomeCliente(r),
      modalidade: modalidade(r),
      descricao: primeiro(r, ["procedimento", "especialidade", "descricao", "planoNome", "plano"], ""),
      clinica: primeiro(r, ["clinicaNome", "clinica", "nomeClinica"], ""),
      vendedor: primeiro(r, ["vendedorNome", "vendedor", "responsavel", "criadoPorNome"], ""),
      valor: valorRegistro(r).toFixed(2).replace(".", ","),
      custo: numero(primeiro(r, ["custoClinica", "valorCusto", "custo", "valorRepasse", "repasseClinica"], 0)).toFixed(2).replace(".", ","),
      formaPagamento: primeiro(r, ["formaPagamento", "metodoPagamento", "meioPagamento", "paymentMethod"], ""),
      statusVenda: primeiro(r, ["statusVenda", "status", "situacao"], ""),
      statusPagamento: statusPagamento(r),
      dataVencimento: primeiro(r, ["dataVencimento", "vencimento"], ""),
    };
  });

  const exportarAba = () => {
    const tipos = {
      consultas: ["Consulta", "Agendamento"],
      exames: ["Exame"],
      carteirinhas: ["Carteirinha"],
      mensalidades: ["Mensalidade"],
      clinicas: ["Exame", "Consulta", "Agendamento"],
      pagamentos: ["Pagamento"],
    };
    const selecionados = aba === "geral" ? linhasCSV : linhasCSV.filter((l) => (tipos[aba] || []).includes(l.tipo));
    baixarCSV(`relatorio_${aba}`, selecionados);
  };

  const card = (titulo, valor, detalhe, cor = "#172033") => (
    <div style={{ background: "#fff", border: "1px solid #e7eaf0", borderRadius: 16, padding: 18, minWidth: 0 }}>
      <div style={{ color: "#667085", fontSize: 13, marginBottom: 9 }}>{titulo}</div>
      <div style={{ color: cor, fontSize: 25, fontWeight: 750, letterSpacing: -0.6 }}>{moeda(valor)}</div>
      <div style={{ color: "#98a2b3", fontSize: 12, marginTop: 7 }}>{detalhe}</div>
    </div>
  );

  const tabela = filtrados.filter((r) => {
    if (aba === "consultas") return ["Consulta", "Agendamento"].includes(r.__tipo);
    if (aba === "exames") return r.__tipo === "Exame";
    if (aba === "carteirinhas") return r.__tipo === "Carteirinha";
    if (aba === "mensalidades") return r.__tipo === "Mensalidade" || /light|enel|edp/i.test(modalidade(r));
    if (aba === "clinicas") return ["Exame", "Consulta", "Agendamento"].includes(r.__tipo);
    if (aba === "pagamentos") return r.__tipo === "Pagamento";
    return true;
  });

  return (
    <div style={{ fontFamily: FONT, padding: "26px clamp(16px, 3vw, 34px)", color: "#172033", background: "#f6f8fb", minHeight: "calc(100vh - 80px)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 22 }}>
        <div>
          <div style={{ color: "#667085", fontSize: 12, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase" }}>Financeiro e gestão</div>
          <h1 style={{ fontSize: 29, margin: "7px 0 6px", letterSpacing: -0.8 }}>Central de Relatórios</h1>
          <p style={{ color: "#667085", margin: 0, fontSize: 14 }}>Acompanhe vendas, recebimentos, pendências e custos em um só lugar.</p>
        </div>
        <button onClick={exportarAba} style={{ border: 0, background: "#155eef", color: "#fff", borderRadius: 10, padding: "12px 17px", fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 12px #155eef30" }}>↓ Exportar CSV</button>
      </div>

      <section style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "end", background: "#fff", border: "1px solid #e7eaf0", borderRadius: 14, padding: 15, marginBottom: 18 }}>
        <label style={{ display: "grid", gap: 6, fontSize: 12, color: "#667085" }}>Data inicial<input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} style={inputStyle}/></label>
        <label style={{ display: "grid", gap: 6, fontSize: 12, color: "#667085" }}>Data final<input type="date" value={fim} onChange={(e) => setFim(e.target.value)} style={inputStyle}/></label>
        <label style={{ display: "grid", gap: 6, fontSize: 12, color: "#667085" }}>Situação do pagamento<select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} style={inputStyle}><option value="todos">Todas</option><option value="pagos">Pagos / confirmados</option><option value="pendentes">Pendentes / não pagos</option></select></label>
        <label style={{ display: "grid", gap: 6, flex: "1 1 220px", fontSize: 12, color: "#667085" }}>Buscar cliente, clínica ou modalidade<input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Digite para pesquisar..." style={inputStyle}/></label>
      </section>

      <nav style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 12, marginBottom: 8 }}>
        {ABAS.map(([id, nome]) => <button key={id} onClick={() => setAba(id)} style={{ whiteSpace: "nowrap", border: `1px solid ${aba === id ? "#155eef" : "#e4e7ec"}`, background: aba === id ? "#eff4ff" : "#fff", color: aba === id ? "#1849a9" : "#475467", borderRadius: 9, padding: "10px 13px", fontWeight: 650, cursor: "pointer", fontSize: 13 }}>{nome}</button>)}
      </nav>

      {erros && Object.values(erros).some(Boolean) && <div style={{ background: "#fffaeb", border: "1px solid #fedf89", color: "#93370d", padding: 13, borderRadius: 10, fontSize: 13, marginBottom: 16 }}><strong>Atenção às permissões do Firestore:</strong>{Object.entries(erros).filter(([, e]) => e).map(([colecao, erro]) => <div key={colecao}>{colecao}: {erro}</div>)}</div>}

      {aba === "geral" && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(205px, 1fr))", gap: 12, marginBottom: 20 }}>
        {card("Total vendido", totalVendido, `${vendas.length} vendas no período`)}
        {card("Total recebido", totalRecebido, `${pagamentos.filter(estaPago).length} pagamentos confirmados`, "#067647")}
        {card("Valores pendentes", totalPendente, "Estimativa a receber", "#b54708")}
        {card("Custos registrados", custos, "Custos e repasses identificados", "#b42318")}
        {card("Resultado recebido − custos", resultado, "Não representa lucro líquido contábil", resultado >= 0 ? "#067647" : "#b42318")}
      </div>}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, margin: "12px 0", flexWrap: "wrap" }}>
        <div><h2 style={{ margin: 0, fontSize: 18 }}>{ABAS.find(([id]) => id === aba)?.[1]}</h2><div style={{ color: "#667085", fontSize: 12, marginTop: 4 }}>{tabela.length} registro(s) encontrados</div></div>
        <button onClick={exportarAba} style={{ border: "1px solid #d0d5dd", background: "#fff", color: "#344054", borderRadius: 9, padding: "9px 13px", fontWeight: 650, cursor: "pointer" }}>Exportar esta visão CSV</button>
      </div>

      <div style={{ background: "#fff", border: "1px solid #e7eaf0", borderRadius: 14, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 950, fontSize: 13 }}>
          <thead><tr style={{ background: "#f9fafb", color: "#667085", textAlign: "left" }}>{["Data", "Tipo", "Cliente", "Modalidade / serviço", "Clínica", "Valor", "Pagamento", "Status"].map((h) => <th key={h} style={{ padding: "13px 14px", fontWeight: 650, borderBottom: "1px solid #eaecf0" }}>{h}</th>)}</tr></thead>
          <tbody>
            {tabela.slice(0, 300).map((r) => {
              const d = dataRegistro(r);
              const pago = estaPago(r);
              return <tr key={`${r.__colecao}-${r.id}`}>
                <td style={tdStyle}>{d ? d.toLocaleDateString("pt-BR") : "—"}</td>
                <td style={tdStyle}>{r.__tipo}</td>
                <td style={tdStyle}>{nomeCliente(r)}</td>
                <td style={tdStyle}>{primeiro(r, ["procedimento", "especialidade", "descricao", "planoNome", "plano"], modalidade(r))}</td>
                <td style={tdStyle}>{primeiro(r, ["clinicaNome", "clinica", "nomeClinica"], "—")}</td>
                <td style={{ ...tdStyle, fontWeight: 700 }}>{moeda(valorRegistro(r))}</td>
                <td style={tdStyle}>{primeiro(r, ["formaPagamento", "metodoPagamento", "meioPagamento"], "—")}</td>
                <td style={tdStyle}><span style={{ display: "inline-block", borderRadius: 20, padding: "4px 9px", background: pago ? "#ecfdf3" : "#fffaeb", color: pago ? "#027a48" : "#b54708", fontSize: 11, fontWeight: 700 }}>{statusPagamento(r)}</span></td>
              </tr>;
            })}
            {!carregando && tabela.length === 0 && <tr><td colSpan={8} style={{ padding: 35, textAlign: "center", color: "#98a2b3" }}>Nenhum registro encontrado para os filtros selecionados.</td></tr>}
            {carregando && <tr><td colSpan={8} style={{ padding: 35, textAlign: "center", color: "#667085" }}>Carregando informações financeiras...</td></tr>}
          </tbody>
        </table>
        {tabela.length > 300 && <div style={{ padding: 12, color: "#667085", fontSize: 12, borderTop: "1px solid #eaecf0" }}>A tela exibe os primeiros 300 registros. A exportação CSV inclui todos os registros filtrados.</div>}
      </div>
      <p style={{ color: "#98a2b3", fontSize: 11, marginTop: 13, lineHeight: 1.5 }}>Observação: os totais dependem dos campos existentes em cada documento. A coleção mensalidades é consultada como fonte opcional; Light Plus, ENEL e EDP serão identificados pelos campos de modalidade/concessionária quando cadastrados. Confirme os nomes reais dos campos e das coleções antes de usar estes números como fechamento contábil.</p>
    </div>
  );
}

const inputStyle = { height: 39, border: "1px solid #d0d5dd", borderRadius: 8, padding: "0 10px", color: "#344054", background: "#fff", fontSize: 13, minWidth: 150 };
const tdStyle = { padding: "12px 14px", borderBottom: "1px solid #f0f1f3", color: "#344054", verticalAlign: "middle" };
