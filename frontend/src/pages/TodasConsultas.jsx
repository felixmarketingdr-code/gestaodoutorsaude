import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import {
  Activity, CalendarDays, ChevronDown, ChevronUp, Filter, RefreshCw,
  Search, Stethoscope, UserRound, Wallet, FileText, AlertCircle,
  Download, Building2, Clock3,
} from "lucide-react";
import { db } from "../config/firebase";
import "./TodasConsultas.css";

const normalizar = (valor) => String(valor ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const dataTimestamp = (valor) => {
  if (!valor) return 0;
  if (typeof valor?.toDate === "function") return valor.toDate().getTime();
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? 0 : data.getTime();
};
const dataBR = (valor) => {
  const timestamp = dataTimestamp(valor);
  return timestamp ? new Date(timestamp).toLocaleDateString("pt-BR") : "—";
};
const moeda = (valor) => Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const clienteNome = (v) => v.clienteNome || v.cliente?.nomeCompleto || v.cliente?.nome || "Cliente não informado";
const clienteCPF = (v) => v.clienteCPF || v.cliente?.cpf || v.cliente?.documento || "";
const pagamentoTexto = (v) => v.statusPagamentoLabel || v.statusPagamento || (v.pagamentoConfirmado ? "Pago" : "Não iniciado");
const consultaValor = (v) => {
  const candidatos = [v.valorTotal, v.valor, v.valorConsulta, v.valorFinal];
  for (const candidato of candidatos) {
    if (candidato !== undefined && candidato !== null && candidato !== "") {
      const numero = Number(String(candidato).replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
      if (Number.isFinite(numero)) return numero;
    }
  }
  return 0;
};
const pago = (v) => v.pagamentoConfirmado === true || ["pago", "paid", "confirmado", "succeeded"].includes(normalizar(v.statusPagamento));

function identificarAdministrador(usuario, claims = {}) {
  const perfil = normalizar(usuario?.role || usuario?.perfil || usuario?.tipoUsuario || claims.role || claims.perfil);
  return ["admin", "administrador", "administracao"].includes(perfil)
    || claims.admin === true || claims.administrador === true;
}

export default function TodasConsultas({ usuario }) {
  const [vendas, setVendas] = useState([]);
  const [ehAdmin, setEhAdmin] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [filtrosAbertos, setFiltrosAbertos] = useState(true);
  const [filtros, setFiltros] = useState({ clinica: "", especialidade: "", pagamento: "", agendamento: "", vendedor: "", dataInicial: "", dataFinal: "" });

  const carregar = useCallback(async (silencioso = false) => {
    if (!usuario?.uid) {
      setVendas([]);
      setCarregando(false);
      setErro("Não foi possível identificar o usuário conectado.");
      return;
    }
    silencioso ? setAtualizando(true) : setCarregando(true);
    setErro("");
    try {
      let claims = usuario.customClaims || {};
      if (typeof usuario.getIdTokenResult === "function") {
        const resultadoToken = await usuario.getIdTokenResult(true);
        claims = resultadoToken?.claims || claims;
      }
      const administrador = identificarAdministrador(usuario, claims);
      setEhAdmin(administrador);
      const referencia = collection(db, "vendasConsultas");
      // Administradores consultam a coleção completa; vendedores consultam apenas seus registros.
      const consulta = administrador ? referencia : query(referencia, where("vendedorId", "==", usuario.uid));
      const snapshot = await getDocs(consulta);
      const registros = snapshot.docs.map((documento) => ({ id: documento.id, ...documento.data() }));
      registros.sort((a, b) => dataTimestamp(b.criadoEm || b.dataVenda) - dataTimestamp(a.criadoEm || a.dataVenda));
      setVendas(registros);
    } catch (error) {
      console.error("Erro ao carregar vendas de consultas:", error);
      setErro(error.code === "permission-denied"
        ? "O Firestore bloqueou esta consulta. Confira as regras de leitura da coleção vendasConsultas para administradores e vendedores."
        : `Não foi possível carregar as consultas: ${error.message || "erro desconhecido"}`);
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }, [usuario]);

  useEffect(() => { carregar(); }, [carregar]);

  const linhas = useMemo(() => vendas.map((v) => ({
    ...v,
    cliente: clienteNome(v),
    cpf: clienteCPF(v),
    clinica: v.clinicaNome || v.clinica || "Clínica não informada",
    especialidade: v.especialidade || v.servico || "Consulta não informada",
    medico: v.medico || v.medicoNome || "A confirmar",
    dataConsulta: v.dataAgendamento || v.dataConsulta || v.dataAtendimento || null,
    horario: v.horarioAgendamento || v.horario || "—",
    valorRegistro: consultaValor(v),
    pagamento: pagamentoTexto(v),
    agendamento: v.statusAgendamento || "Não informado",
    vendedor: v.responsavelNome || v.vendedorNome || v.nomeVendedor || "—",
  })), [vendas]);

  const opcoes = useMemo(() => ({
    clinicas: [...new Set(linhas.map((v) => v.clinica).filter((v) => v && v !== "Clínica não informada"))].sort((a,b) => a.localeCompare(b, "pt-BR")),
    especialidades: [...new Set(linhas.map((v) => v.especialidade).filter((v) => v && v !== "Consulta não informada"))].sort((a,b) => a.localeCompare(b, "pt-BR")),
    vendedores: [...new Set(linhas.map((v) => v.vendedor).filter((v) => v && v !== "—"))].sort((a,b) => a.localeCompare(b, "pt-BR")),
  }), [linhas]);

  const filtradas = useMemo(() => {
    const termo = normalizar(busca);
    return linhas.filter((v) => {
      const texto = [v.cliente, v.cpf, v.clienteTelefone, v.clinica, v.especialidade, v.medico, v.id, v.vendedor, v.regiao].map(normalizar).join(" ");
      const data = dataTimestamp(v.dataConsulta || v.criadoEm);
      const inicio = filtros.dataInicial ? new Date(`${filtros.dataInicial}T00:00:00`).getTime() : 0;
      const fim = filtros.dataFinal ? new Date(`${filtros.dataFinal}T23:59:59`).getTime() : Infinity;
      return (!termo || texto.includes(termo))
        && (!filtros.clinica || v.clinica === filtros.clinica)
        && (!filtros.especialidade || v.especialidade === filtros.especialidade)
        && (!filtros.pagamento || normalizar(v.pagamento).includes(normalizar(filtros.pagamento)))
        && (!filtros.agendamento || normalizar(v.agendamento).includes(normalizar(filtros.agendamento)))
        && (!filtros.vendedor || v.vendedor === filtros.vendedor)
        && (!filtros.dataInicial || (data && data >= inicio))
        && (!filtros.dataFinal || (data && data <= fim));
    });
  }, [linhas, busca, filtros]);

  const totalPago = filtradas.filter(pago).length;
  const valorVendido = filtradas.reduce((soma, v) => soma + v.valorRegistro, 0);
  const valorRecebido = filtradas.reduce((soma, v) => soma + (pago(v) ? v.valorRegistro : 0), 0);
  const confirmadas = filtradas.filter((v) => normalizar(v.agendamento) === "confirmado" || normalizar(v.agendamento) === "realizado").length;
  const alterarFiltro = (campo, valor) => setFiltros((anterior) => ({ ...anterior, [campo]: valor }));
  const limparFiltros = () => { setBusca(""); setFiltros({ clinica: "", especialidade: "", pagamento: "", agendamento: "", vendedor: "", dataInicial: "", dataFinal: "" }); };

  function exportarCSV() {
    const cabecalho = ["ID da venda", "Cliente", "CPF", "Telefone", "Clínica", "Endereço da clínica", "Região", "Especialidade/consulta", "Médico", "Data da consulta", "Horário", "Modalidade", "Valor", "Status do agendamento", "Status do pagamento", "Pagamento confirmado", "Vendedor", "Data da venda"];
    const linhasCSV = filtradas.map((v) => [v.id, v.cliente, v.cpf, v.clienteTelefone, v.clinica, v.clinicaEndereco, v.regiao, v.especialidade, v.medico, v.dataConsulta, v.horario, v.modalidade, v.valorRegistro, v.agendamento, v.pagamento, pago(v) ? "Sim" : "Não", v.vendedor, v.criadoEm?.toDate?.()?.toISOString?.() || v.criadoEm || v.dataVenda]);
    const csv = [cabecalho, ...linhasCSV].map((linha) => linha.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "relatorio-todas-consultas.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="todas-consultas">
      <header className="tc-header">
        <div>
          <span className="tc-kicker">GESTÃO COMERCIAL E FATURAMENTO</span>
          <h1>Todas as Consultas</h1>
          <p>{ehAdmin ? "Visão geral das consultas vendidas no sistema para conferência e faturamento." : "Visualização das consultas vendidas por você para conferência e acompanhamento."}</p>
          <div className="tc-breadcrumb"><span>Vendas</span><span>/</span><strong>Consultas</strong></div>
        </div>
        <button className="tc-refresh" type="button" onClick={() => carregar(true)} disabled={atualizando}><RefreshCw size={16} className={atualizando ? "tc-spin" : ""}/> Atualizar</button>
      </header>

      {!ehAdmin && <div className="tc-scope"><UserRound size={16}/> Os dados exibidos são somente das consultas vinculadas ao seu usuário. A visão geral e o faturamento de toda a equipe são restritos aos administradores.</div>}

      <section className="tc-metrics">
        <article><span>Consultas registradas</span><strong>{filtradas.length}</strong><CalendarDays size={21}/></article>
        <article><span>Agendamentos confirmados / realizados</span><strong>{confirmadas}</strong><Activity size={21}/></article>
        <article><span>Valor vendido</span><strong>{moeda(valorVendido)}</strong><Wallet size={21}/></article>
        <article><span>Valor recebido</span><strong>{moeda(valorRecebido)}</strong><FileText size={21}/></article>
      </section>

      <section className="tc-panel">
        <button className="tc-filter-title" type="button" onClick={() => setFiltrosAbertos((v) => !v)}><span><Filter size={16}/> Filtros de conferência</span>{filtrosAbertos ? <ChevronUp size={18}/> : <ChevronDown size={18}/>}</button>
        {filtrosAbertos && <div className="tc-filters">
          <label>Clínica<select value={filtros.clinica} onChange={(e) => alterarFiltro("clinica", e.target.value)}><option value="">Todas as clínicas</option>{opcoes.clinicas.map((v) => <option key={v}>{v}</option>)}</select></label>
          <label>Especialidade / consulta<select value={filtros.especialidade} onChange={(e) => alterarFiltro("especialidade", e.target.value)}><option value="">Todas</option>{opcoes.especialidades.map((v) => <option key={v}>{v}</option>)}</select></label>
          <label>Status do pagamento<select value={filtros.pagamento} onChange={(e) => alterarFiltro("pagamento", e.target.value)}><option value="">Todos</option><option value="pago">Pago</option><option value="pendente">Pendente</option><option value="não iniciado">Não iniciado</option><option value="recusado">Recusado</option></select></label>
          <label>Status do agendamento<select value={filtros.agendamento} onChange={(e) => alterarFiltro("agendamento", e.target.value)}><option value="">Todos</option><option value="aguardando confirmação">Aguardando confirmação</option><option value="confirmado">Confirmado</option><option value="realizado">Realizado</option><option value="cancelado">Cancelado</option><option value="não compareceu">Não compareceu</option></select></label>
          {ehAdmin && <label>Vendedor<select value={filtros.vendedor} onChange={(e) => alterarFiltro("vendedor", e.target.value)}><option value="">Todos os vendedores</option>{opcoes.vendedores.map((v) => <option key={v}>{v}</option>)}</select></label>}
          <label>Data inicial (consulta)<input type="date" value={filtros.dataInicial} onChange={(e) => alterarFiltro("dataInicial", e.target.value)}/></label>
          <label>Data final (consulta)<input type="date" value={filtros.dataFinal} onChange={(e) => alterarFiltro("dataFinal", e.target.value)}/></label>
          <div className="tc-filter-actions"><button type="button" className="tc-clear" onClick={limparFiltros}>Limpar filtros</button></div>
        </div>}
      </section>

      <section className="tc-table-panel">
        <div className="tc-table-top">
          <label className="tc-search"><Search size={17}/><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente, CPF, clínica, especialidade, médico ou venda..."/></label>
          <button className="tc-export" type="button" onClick={exportarCSV}><Download size={16}/> Exportar CSV</button>
          <span>{filtradas.length} consulta(s)</span>
        </div>
        {erro && <div className="tc-error"><AlertCircle size={17}/>{erro}</div>}
        {carregando ? <div className="tc-empty">Carregando vendas de consultas...</div> : filtradas.length === 0 ? <div className="tc-empty"><Stethoscope size={30}/><strong>Nenhuma consulta encontrada</strong><span>Quando uma venda for registrada em Vendas de Consultas, ela aparecerá nesta listagem.</span></div> : (
          <div className="tc-scroll"><table className="tc-table"><thead><tr>
            <th>Cliente</th><th>CPF / telefone</th><th>Clínica</th><th>Especialidade / consulta</th><th>Médico</th><th>Data e horário</th><th>Valor</th><th>Agendamento</th><th>Pagamento</th><th>Vendedor</th><th>Data da venda</th><th>Nº da venda</th>
          </tr></thead><tbody>{filtradas.map((v) => <tr key={v.id}>
            <td><strong>{v.cliente}</strong></td><td>{v.cpf || "—"}<small>{v.clienteTelefone || ""}</small></td><td><strong>{v.clinica}</strong><small>{v.regiao || ""}</small></td><td>{v.especialidade}</td><td>{v.medico}</td><td>{dataBR(v.dataConsulta)}<small>{v.horario}</small></td><td><strong>{moeda(v.valorRegistro)}</strong></td>
            <td><span className={`tc-status ${normalizar(v.agendamento).includes("confirm") || normalizar(v.agendamento).includes("realiz") ? "is-ok" : "is-pending"}`}>{v.agendamento}</span></td>
            <td><span className={`tc-payment ${pago(v) ? "is-paid" : "is-pending"}`}>{v.pagamento}</span></td><td>{v.vendedor}</td><td>{dataBR(v.criadoEm || v.dataVenda)}</td><td title={v.id}>{v.id.slice(0, 9)}</td>
          </tr>)}</tbody></table></div>
        )}
        <footer className="tc-footer">Exibindo {filtradas.length} de {linhas.length} consulta(s). Valor vendido considera os registros filtrados; valor recebido considera somente pagamentos confirmados.{!ehAdmin ? " Os indicadores são limitados às suas próprias vendas." : " Os indicadores representam o resultado geral do sistema."}</footer>
      </section>
    </main>
  );
}
