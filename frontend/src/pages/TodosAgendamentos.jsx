import React, { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Edit3,
  Filter,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Stethoscope,
  X,
  CalendarCheck,
  CalendarX,
} from "lucide-react";

import { db } from "../config/firebase";
import catalogoExames from "../data/catalogoExames";
import catalogoConsultas from "../data/catalogoConsultas";
import "./TodosAgendamentos.css";

const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const normalizar = (v) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const texto = (v) => String(v ?? "").trim();
const lista = (v) => (Array.isArray(v) ? v : v ? [v] : []);

const dataBR = (v) => {
  if (!v) return "—";
  if (typeof v?.toDate === "function") return v.toDate().toLocaleDateString("pt-BR");
  const d = new Date(`${String(v).slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};

const STATUS = [
  "Não agendado",
  "Agendado",
  "Aguardando confirmação",
  "Confirmado",
  "Realizado",
  "Cancelado",
  "Não compareceu",
];

const FORM_INICIAL = {
  tipo: "Exame",
  clinicaId: "",
  servicoId: "",
  paciente: "",
  cpf: "",
  celular: "",
  data: hojeISO(),
  horario: "",
  medico: "",
  status: "Agendado",
  observacoes: "",
};

function montarCatalogo() {
  const mapa = new Map();

  const inserir = (chave, nome, tipo, endereco = "", contato = "", regiao = "", servico = null) => {
    const nomeClinica = texto(nome);
    if (!nomeClinica || normalizar(nomeClinica).includes("não identific")) return;

    const id = `${tipo}-${chave || normalizar(nomeClinica)}`;
    if (!mapa.has(id)) {
      mapa.set(id, {
        id,
        nome: nomeClinica,
        tipo,
        endereco: texto(endereco),
        contato: texto(contato),
        regiao: texto(regiao),
        servicos: [],
      });
    }

    const item = mapa.get(id);
    if (!item.endereco && endereco) item.endereco = texto(endereco);
    if (!item.contato && contato) item.contato = texto(contato);
    if (!item.regiao && regiao) item.regiao = texto(regiao);

    if (servico) {
      const nomeServico = texto(servico.nome);
      if (nomeServico && !item.servicos.some((s) => normalizar(s.nome) === normalizar(nomeServico))) {
        item.servicos.push({
          id: servico.id || `${id}-${item.servicos.length}`,
          nome: nomeServico,
          valor: servico.valor ?? "",
          observacao: texto(servico.observacao),
        });
      }
    }
  };

  lista(catalogoConsultas?.clinicas).forEach((c) => {
    const chave = c.id || `${normalizar(c.clinica)}-${normalizar(c.regiao)}-${normalizar(c.categoriaPlano)}`;
    inserir(chave, c.clinica || c.nome, "Consulta", c.endereco, c.contato, c.regiao);
    const id = `Consulta-${chave}`;
    lista(c.servicos).forEach((s, i) => {
      inserir(chave, c.clinica || c.nome, "Consulta", c.endereco, c.contato, c.regiao, {
        id: `${id}-servico-${i}`,
        nome: s.especialidade || s.nome,
        valor: s.valorTexto || s.valorNumerico || "",
        observacao: s.observacao,
      });
    });
  });

  lista(catalogoExames?.clinicas).forEach((c) => {
    const chave = normalizar(c.clinica);
    inserir(chave, c.clinica, "Exame", lista(c.enderecos).join(" | "), lista(c.telefones).join(" | "), lista(c.cidades_detectadas).join(", "));
  });

  lista(catalogoExames?.procedimentos).forEach((p, i) => {
    const nomeClinica = p.clinica || p.nomeClinica || p.prestador;
    const chave = normalizar(nomeClinica);
    inserir(
      chave,
      nomeClinica,
      "Exame",
      lista(p.enderecos).join(" | "),
      lista(p.telefones).join(" | "),
      lista(p.cidade_clinica).join(", "),
      {
        id: `${chave}-procedimento-${p.aba_origem || ""}-${p.linha_origem || i}`,
        nome: p.procedimento || p.nome || p.descricao,
        valor: p.colunas?.C?.valor_calculado ?? p.colunas?.C?.original ?? "",
        observacao: p.observacoes,
      }
    );
  });

  return [...mapa.values()]
    .map((c) => ({ ...c, servicos: c.servicos.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")) }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

const CATALOGO = montarCatalogo();

function mapearVendaExame(snap) {
  const d = snap.data();
  const itens = lista(d.itens);
  const cliente = d.cliente || {};
  const nomesExames = itens.map((i) => i.exameNome || i.nomeExame || i.procedimento || i.nome || i.exame || i.descricao || "").filter(Boolean);
  const clinicas = itens.map((i) => i.clinicaNome || i.clinica || i.prestador || "").filter(Boolean);
  const enderecos = itens.map((i) => i.endereco || i.clinicaEndereco || i.enderecoClinica || "").filter(Boolean);
  const primeiro = itens[0] || {};
  return {
    ...d,
    id: snap.id,
    origemCollection: "vendasExames",
    origemTipo: "Exame",
    tipo: "Exame",
    paciente: d.clienteNome || cliente.nomeCompleto || cliente.nome || d.paciente || d.nomeCliente || "",
    cpf: d.clienteCPF || cliente.cpf || cliente.documento || d.cpf || "",
    celular: d.clienteTelefone || cliente.telefone || cliente.celular || d.celular || d.telefone || "",
    servicoNome: nomesExames.join(", ") || d.exame || d.servicoNome || d.procedimento || "Exame vendido",
    exame: nomesExames.join(", "),
    clinicaNome: d.clinicaNome || d.clinica || primeiro.clinicaNome || primeiro.clinica || clinicas.join(", ") || "",
    clinicaEndereco: d.clinicaEndereco || primeiro.endereco || enderecos.join(" | ") || "",
    data: d.dataAgendamento || d.dataExame || "",
    horario: d.horarioAgendamento || d.horario || "",
    status: ["agendado", "confirmado", "realizado", "cancelado", "não compareceu"].includes(normalizar(d.statusAgendamento))
      ? d.statusAgendamento : "Não agendado",
    statusVenda: d.statusVenda || d.statusPagamento || d.checkoutStatus || (d.pagamentoConfirmado === true ? "Pago" : "Pendente"),
    origemLabel: "Venda de exames",
  };
}

function mapearVendaConsulta(snap) {
  const d = snap.data();
  const cliente = d.cliente || {};
  return {
    ...d,
    id: snap.id,
    origemCollection: "vendasConsultas",
    origemTipo: "Consulta",
    tipo: "Consulta",
    paciente: d.clienteNome || cliente.nomeCompleto || cliente.nome || d.paciente || "",
    cpf: d.clienteCPF || cliente.cpf || cliente.documento || d.cpf || "",
    celular: d.clienteTelefone || cliente.telefone || cliente.celular || d.celular || "",
    servicoNome: d.especialidade || d.servico || d.servicoNome || "Consulta",
    clinicaNome: d.clinicaNome || d.clinica || "",
    data: d.dataAgendamento || d.dataConsulta || "",
    horario: d.horarioAgendamento || d.horario || "",
    status: ["agendado", "confirmado", "realizado", "cancelado", "não compareceu"].includes(normalizar(d.statusAgendamento))
      ? d.statusAgendamento : "Não agendado",
    statusVenda: d.statusVenda || d.statusPagamento || d.checkoutStatus || (d.pagamentoConfirmado === true ? "Pago" : "Pendente"),
    origemLabel: "Venda de consultas",
  };
}

function mapearAgendamento(snap) {
  const d = snap.data();
  return {
    ...d,
    id: snap.id,
    origemCollection: "agendamentos",
    origemTipo: d.tipo || "Exame",
    paciente: d.paciente || d.clienteNome || "",
    cpf: d.cpf || d.clienteCPF || "",
    celular: d.celular || d.clienteTelefone || "",
    servicoNome: d.servicoNome || d.exame || d.especialidade || "",
    data: d.data || d.dataAgendamento || "",
    horario: d.horario || d.horarioAgendamento || "",
    status: d.status || d.statusAgendamento || "Não agendado",
    origemLabel: "Agendamento manual",
  };
}

export default function TodosAgendamentos({ usuario }) {
  const [agendamentos, setAgendamentos] = useState([]);
  const [vendasExames, setVendasExames] = useState([]);
  const [vendasConsultas, setVendasConsultas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [mostrarFiltros, setMostrarFiltros] = useState(true);
  const [filtros, setFiltros] = useState({
    tipo: "",
    clinica: "",
    status: "",
    dataInicial: "",
    dataFinal: "",
  });
  const [modalAberto, setModalAberto] = useState(false);
  const [editandoId, setEditandoId] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState(FORM_INICIAL);
  const [mensagem, setMensagem] = useState("");

  const [modalAgenda, setModalAgenda] = useState(false);
  const [registroAgenda, setRegistroAgenda] = useState(null);
  const [dataAgenda, setDataAgenda] = useState(hojeISO());
  const [horaAgenda, setHoraAgenda] = useState("");
  const [medicoAgenda, setMedicoAgenda] = useState("");
  const [obsAgenda, setObsAgenda] = useState("");
  const [salvandoAgenda, setSalvandoAgenda] = useState(false);

  useEffect(() => {
    let ativo = true;
    const carregadas = { agendamentos: false, vendasExames: false, vendasConsultas: false };

    const concluirCarga = (chave) => {
      carregadas[chave] = true;
      if (ativo && Object.values(carregadas).every(Boolean)) setCarregando(false);
    };

    const tratarErro = (chave, error) => {
      console.error(`[TodosAgendamentos] Erro em ${chave}:`, error);
      if (!ativo) return;
      setErro((atual) => {
        const mensagem = error.code === "permission-denied"
          ? `Sem permissão para ler a coleção ${chave}.`
          : `Erro ao consultar ${chave}: ${error.message || "erro desconhecido"}`;
        return atual ? `${atual} | ${mensagem}` : mensagem;
      });
      concluirCarga(chave);
    };

    const cancelarAgendamentos = onSnapshot(
      collection(db, "agendamentos"),
      (snapshot) => {
        if (!ativo) return;
        setAgendamentos(snapshot.docs.map(mapearAgendamento));
        concluirCarga("agendamentos");
      },
      (error) => tratarErro("agendamentos", error)
    );

    const cancelarExames = onSnapshot(
      collection(db, "vendasExames"),
      (snapshot) => {
        if (!ativo) return;
        const registros = snapshot.docs.map(mapearVendaExame);
        console.info("[TodosAgendamentos] vendasExames:", registros.length);
        setVendasExames(registros);
        concluirCarga("vendasExames");
      },
      (error) => tratarErro("vendasExames", error)
    );

    const cancelarConsultas = onSnapshot(
      collection(db, "vendasConsultas"),
      (snapshot) => {
        if (!ativo) return;
        const registros = snapshot.docs.map(mapearVendaConsulta);
        console.info("[TodosAgendamentos] vendasConsultas:", registros.length);
        setVendasConsultas(registros);
        concluirCarga("vendasConsultas");
      },
      (error) => tratarErro("vendasConsultas", error)
    );

    return () => {
      ativo = false;
      cancelarAgendamentos();
      cancelarExames();
      cancelarConsultas();
    };
  }, []);

  const clinicaSelecionada = useMemo(
    () => CATALOGO.find((c) => c.id === form.clinicaId) || null,
    [form.clinicaId]
  );

  const clinicasDisponiveis = useMemo(
    () => CATALOGO.filter((c) => c.tipo === form.tipo),
    [form.tipo]
  );

  const servicosDisponiveis = clinicaSelecionada?.servicos || [];
  const servicoSelecionado = servicosDisponiveis.find((s) => s.id === form.servicoId) || null;

  const todosRegistros = useMemo(() => {
    const registros = [...agendamentos, ...vendasExames, ...vendasConsultas];
    const chaves = new Set();
    return registros.filter((r) => {
      const chaveOrigem = r.origemCollection === "agendamentos"
        ? (r.vendaOrigemId ? `${r.vendaOrigemCollection}:${r.vendaOrigemId}` : `agendamentos:${r.id}`)
        : `${r.origemCollection}:${r.id}`;
      if (chaves.has(chaveOrigem)) return false;
      chaves.add(chaveOrigem);
      return true;
    });
  }, [agendamentos, vendasExames, vendasConsultas]);

  const filtrados = useMemo(() => {
    const termo = normalizar(busca);
    return todosRegistros.filter((a) => {
      const textoBusca = [
        a.paciente, a.clienteNome, a.cpf, a.clienteCPF, a.celular,
        a.clinicaNome, a.servicoNome, a.exame, a.especialidade, a.medico, a.id,
      ].map(normalizar).join(" ");

      const data = texto(a.data || a.dataAgendamento).slice(0, 10);
      return (
        (!termo || textoBusca.includes(termo)) &&
        (!filtros.tipo || normalizar(a.tipo) === normalizar(filtros.tipo)) &&
        (!filtros.clinica || a.clinicaNome === filtros.clinica) &&
        (!filtros.status || normalizar(a.status) === normalizar(filtros.status)) &&
        (!filtros.dataInicial || (data && data >= filtros.dataInicial)) &&
        (!filtros.dataFinal || (data && data <= filtros.dataFinal))
      );
    }).sort((a, b) => {
      const da = `${a.data || a.dataAgendamento || "9999-99-99"} ${a.horario || a.horarioAgendamento || ""}`;
      const dbb = `${b.data || b.dataAgendamento || "9999-99-99"} ${b.horario || b.horarioAgendamento || ""}`;
      return da.localeCompare(dbb);
    });
  }, [todosRegistros, busca, filtros]);

  function atualizar(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  function novoAgendamento() {
    setEditandoId("");
    setForm(FORM_INICIAL);
    setMensagem("");
    setModalAberto(true);
  }

  function editarAgendamento(a) {
    setEditandoId(a.id);
    setForm({
      tipo: a.tipo || "Exame",
      clinicaId: a.clinicaId || "",
      servicoId: a.servicoId || "",
      paciente: a.paciente || a.clienteNome || "",
      cpf: a.cpf || a.clienteCPF || "",
      celular: a.celular || a.clienteTelefone || "",
      data: a.data || a.dataAgendamento || hojeISO(),
      horario: a.horario || a.horarioAgendamento || "",
      medico: a.medico || "",
      status: a.status || a.statusAgendamento || "Agendado",
      observacoes: a.observacoes || "",
    });
    setMensagem("");
    setModalAberto(true);
  }

  async function salvar(e) {
    e.preventDefault();
    if (!form.paciente || !form.clinicaId || !form.servicoId || !form.data || !form.horario) {
      setMensagem("Preencha paciente, clínica, exame/consulta, data e horário.");
      return;
    }
    if (!clinicaSelecionada || !servicoSelecionado) {
      setMensagem("Selecione novamente a clínica e o serviço no catálogo.");
      return;
    }

    setSalvando(true);
    setMensagem("");
    const dados = {
      tipo: form.tipo,
      clinicaId: clinicaSelecionada.id,
      clinicaNome: clinicaSelecionada.nome,
      clinicaEndereco: clinicaSelecionada.endereco,
      clinicaContato: clinicaSelecionada.contato,
      regiao: clinicaSelecionada.regiao,
      servicoId: servicoSelecionado.id,
      servicoNome: servicoSelecionado.nome,
      exame: form.tipo === "Exame" ? servicoSelecionado.nome : "",
      especialidade: form.tipo === "Consulta" ? servicoSelecionado.nome : "",
      paciente: form.paciente,
      cpf: form.cpf,
      celular: form.celular,
      data: form.data,
      horario: form.horario,
      dataAgendamento: form.data,
      horarioAgendamento: form.horario,
      medico: form.medico,
      status: form.status,
      statusAgendamento: form.status,
      observacoes: form.observacoes,
      criadoPor: usuario?.uid || usuario?.id || "",
      responsavelNome: usuario?.displayName || usuario?.nome || usuario?.nomeCompleto || "",
      atualizadoEm: serverTimestamp(),
    };

    try {
      if (editandoId) {
        await updateDoc(doc(db, "agendamentos", editandoId), dados);
      } else {
        await addDoc(collection(db, "agendamentos"), {
          ...dados,
          origemCollection: "agendamentos",
          criadoEm: serverTimestamp(),
        });
      }
      setModalAberto(false);
      setEditandoId("");
      setForm(FORM_INICIAL);
      setMensagem("");
    } catch (e2) {
      console.error("Erro ao salvar agendamento:", e2);
      setMensagem(
        e2.code === "permission-denied"
          ? "O Firestore bloqueou a gravação. Confira as regras da coleção agendamentos."
          : "Não foi possível salvar o agendamento. Tente novamente."
      );
    } finally {
      setSalvando(false);
    }
  }

  function abrirModalAgendamento(registro) {
    setRegistroAgenda(registro);
    setDataAgenda(registro.data || registro.dataAgendamento || hojeISO());
    setHoraAgenda(registro.horario || registro.horarioAgendamento || "");
    setMedicoAgenda(registro.medico || "");
    setObsAgenda(registro.observacoes || "");
    setModalAgenda(true);
  }

  async function salvarStatusAgenda(status) {
    if (!registroAgenda) return;
    if (status === "Agendado" && (!dataAgenda || !horaAgenda)) {
      setErro("Informe a data e o horário para marcar como agendado.");
      return;
    }

    setSalvandoAgenda(true);
    setErro("");
    const dados = {
      statusAgendamento: status,
      dataAgendamento: status === "Agendado" ? dataAgenda : "",
      horarioAgendamento: status === "Agendado" ? horaAgenda : "",
      medico: medicoAgenda,
      observacoes: obsAgenda,
      agendamentoAtualizadoPor: usuario?.uid || usuario?.id || "",
      agendamentoAtualizadoPorNome: usuario?.displayName || usuario?.nome || usuario?.nomeCompleto || "",
      atualizadoEm: serverTimestamp(),
      ...(registroAgenda.origemCollection === "agendamentos"
        ? {
            status,
            data: status === "Agendado" ? dataAgenda : "",
            horario: status === "Agendado" ? horaAgenda : "",
          }
        : {}),
    };

    try {
      await updateDoc(doc(db, registroAgenda.origemCollection, registroAgenda.id), dados);
      setModalAgenda(false);
      setRegistroAgenda(null);
    } catch (e) {
      console.error("Erro ao atualizar controle de agendamento:", e);
      setErro(
        e.code === "permission-denied"
          ? `Sem permissão para atualizar ${registroAgenda.origemCollection}. Verifique as regras do Firestore.`
          : "Não foi possível atualizar o agendamento."
      );
    } finally {
      setSalvandoAgenda(false);
    }
  }

  async function marcarNaoAgendado(registro) {
    setRegistroAgenda(registro);
    setSalvandoAgenda(true);
    setErro("");
    try {
      await updateDoc(doc(db, registro.origemCollection, registro.id), {
        statusAgendamento: "Não agendado",
        dataAgendamento: "",
        horarioAgendamento: "",
        atualizadoEm: serverTimestamp(),
        agendamentoAtualizadoPor: usuario?.uid || usuario?.id || "",
        ...(registro.origemCollection === "agendamentos"
          ? { status: "Não agendado", data: "", horario: "" }
          : {}),
      });
    } catch (e) {
      console.error("Erro ao marcar como não agendado:", e);
      setErro("Não foi possível atualizar o status. Verifique as permissões do Firestore.");
    } finally {
      setSalvandoAgenda(false);
      setRegistroAgenda(null);
    }
  }

  function limparFiltros() {
    setBusca("");
    setFiltros({ tipo: "", clinica: "", status: "", dataInicial: "", dataFinal: "" });
  }

  const clinicasFiltro = [...new Set(todosRegistros.map((a) => a.clinicaNome).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "pt-BR"));

  const naoAgendados = todosRegistros.filter((a) => normalizar(a.status) === "nao agendado").length;
  const agendados = todosRegistros.filter((a) => ["agendado", "confirmado"].includes(normalizar(a.status))).length;
  const tipoLabel = (a) => normalizar(a.tipo) === "consulta" ? "Consulta" : "Exame";

  return (
    <main className="todos-agendamentos">
      <header className="ta-header">
        <div>
          <span className="ta-kicker">ATENDIMENTO</span>
          <h1>Todos os Agendamentos</h1>
          <p>Exames e consultas em uma única fila de controle operacional.</p>
        </div>
        <button className="ta-primary" type="button" onClick={novoAgendamento}>
          <Plus size={17} /> Novo agendamento
        </button>
      </header>

      <section className="ta-resumo">
        <article><CalendarDays /><span>Total na fila</span><strong>{todosRegistros.length}</strong></article>
        <article><CalendarX /><span>Não agendados</span><strong>{naoAgendados}</strong></article>
        <article><CalendarCheck /><span>Agendados / confirmados</span><strong>{agendados}</strong></article>
        <article><CheckCircle2 /><span>Realizados</span><strong>{todosRegistros.filter((a) => normalizar(a.status) === "realizado").length}</strong></article>
      </section>

      <section className="ta-panel">
        <button className="ta-filter-title" type="button" onClick={() => setMostrarFiltros((v) => !v)}>
          <span><Filter size={16} /> Filtros</span>
          <span>{mostrarFiltros ? "−" : "+"}</span>
        </button>
        {mostrarFiltros && (
          <div className="ta-filtros">
            <label>Tipo
              <select value={filtros.tipo} onChange={(e) => setFiltros((f) => ({ ...f, tipo: e.target.value }))}>
                <option value="">Todos</option><option>Exame</option><option>Consulta</option>
              </select>
            </label>
            <label>Clínica
              <select value={filtros.clinica} onChange={(e) => setFiltros((f) => ({ ...f, clinica: e.target.value }))}>
                <option value="">Todas as clínicas</option>
                {clinicasFiltro.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label>Status
              <select value={filtros.status} onChange={(e) => setFiltros((f) => ({ ...f, status: e.target.value }))}>
                <option value="">Todos</option>{STATUS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label>Data inicial<input type="date" value={filtros.dataInicial} onChange={(e) => setFiltros((f) => ({ ...f, dataInicial: e.target.value }))} /></label>
            <label>Data final<input type="date" value={filtros.dataFinal} onChange={(e) => setFiltros((f) => ({ ...f, dataFinal: e.target.value }))} /></label>
            <button className="ta-clear" type="button" onClick={limparFiltros}>Limpar filtros</button>
          </div>
        )}
      </section>

      <section className="ta-table-panel">
        <div className="ta-table-top">
          <label className="ta-search"><Search size={17} /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar paciente, CPF, clínica, exame ou consulta..." /></label>
          <span>{filtrados.length} registro(s)</span>
        </div>

        {erro && <div className="ta-alerta"><AlertCircle size={17} />{erro}</div>}

        {carregando ? (
          <div className="ta-vazio"><RefreshCw className="ta-spin" /> Carregando exames e consultas...</div>
        ) : filtrados.length === 0 ? (
          <div className="ta-vazio"><CalendarDays size={30} /><strong>Nenhum registro encontrado</strong><span>Todas as vendas de exames e consultas aparecerão aqui, inclusive as pendentes de pagamento.</span></div>
        ) : (
          <div className="ta-scroll">
            <table className="ta-table">
              <thead><tr>
                <th>Data/Hora</th><th>Paciente</th><th>Clínica</th><th>Tipo</th><th>Exame / Consulta</th><th>Status da venda</th><th>Médico</th><th>Status do agendamento</th><th>Controle</th>
              </tr></thead>
              <tbody>
                {filtrados.map((a) => {
                  const status = a.status || "Não agendado";
                  const agendado = ["agendado", "confirmado"].includes(normalizar(status));
                  return (
                    <tr key={`${a.origemCollection}:${a.id}`}>
                      <td><strong>{dataBR(a.data || a.dataAgendamento)}</strong><small>{a.horario || a.horarioAgendamento || "Horário não definido"}</small></td>
                      <td><strong>{a.paciente || a.clienteNome || "Paciente não informado"}</strong><small>{a.cpf || a.clienteCPF || "CPF não informado"}</small></td>
                      <td>{a.clinicaNome || "Clínica a definir"}<small>{a.clinicaEndereco || ""}</small></td>
                      <td><span className={`ta-tipo ${tipoLabel(a) === "Consulta" ? "consulta" : "exame"}`}>{tipoLabel(a)}</span><small>{a.origemLabel}</small></td>
                      <td>{a.servicoNome || a.exame || a.especialidade || "—"}</td>
                      <td>
                        <span className={`ta-status ${normalizar(a.statusVenda || "Registro manual").replace(/\s+/g, "-")}`}>
                          {a.statusVenda || "Registro manual"}
                        </span>
                      </td>
                      <td>{a.medico || "—"}</td>
                      <td>
                        <span className={`ta-status ${normalizar(status).replace(/\s+/g, "-")}`}>{status}</span>
                      </td>
                      <td>
                        <div className="ta-controle-acoes">
                          <button
                            className="ta-edit"
                            type="button"
                            onClick={() => abrirModalAgendamento(a)}
                            title="Informar data e horário agendados"
                          >
                            <CalendarCheck size={15} /> {agendado ? "Alterar agenda" : "Agendado"}
                          </button>
                          <button
                            className="ta-edit"
                            type="button"
                            onClick={() => marcarNaoAgendado(a)}
                            disabled={salvandoAgenda}
                            title="Marcar como não agendado"
                          >
                            <CalendarX size={15} /> Não agendado
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modalAgenda && registroAgenda && (
        <div className="ta-overlay" onMouseDown={(e) => e.target === e.currentTarget && setModalAgenda(false)}>
          <section className="ta-modal">
            <header>
              <div><span className="ta-kicker">CONTROLE DE AGENDAMENTO</span><h2>Registrar data e horário</h2></div>
              <button type="button" onClick={() => setModalAgenda(false)}><X /></button>
            </header>
            <div className="ta-form-grid">
              <label className="ta-full">Paciente
                <input value={registroAgenda.paciente || registroAgenda.clienteNome || ""} readOnly />
              </label>
              <label className="ta-full">Exame / Consulta
                <input value={registroAgenda.servicoNome || registroAgenda.exame || registroAgenda.especialidade || ""} readOnly />
              </label>
              <label className="ta-full">Clínica
                <input value={registroAgenda.clinicaNome || "A definir"} readOnly />
              </label>
              <label>Data agendada *
                <input type="date" value={dataAgenda} onChange={(e) => setDataAgenda(e.target.value)} required />
              </label>
              <label>Horário agendado *
                <input type="time" value={horaAgenda} onChange={(e) => setHoraAgenda(e.target.value)} required />
              </label>
              <label>Médico / profissional
                <input value={medicoAgenda} onChange={(e) => setMedicoAgenda(e.target.value)} placeholder="Opcional" />
              </label>
              <label className="ta-full">Observações
                <textarea rows="3" value={obsAgenda} onChange={(e) => setObsAgenda(e.target.value)} placeholder="Protocolo, orientação da clínica ou informação interna..." />
              </label>
            </div>
            <footer>
              <button className="ta-secondary" type="button" onClick={() => setModalAgenda(false)}>Cancelar</button>
              <button className="ta-primary" type="button" disabled={salvandoAgenda} onClick={() => salvarStatusAgenda("Agendado")}>
                {salvandoAgenda ? "Salvando..." : "Salvar como agendado"}
              </button>
            </footer>
          </section>
        </div>
      )}

      {modalAberto && (
        <div className="ta-overlay" onMouseDown={(e) => e.target === e.currentTarget && setModalAberto(false)}>
          <section className="ta-modal">
            <header><div><span className="ta-kicker">CONTROLE OPERACIONAL</span><h2>{editandoId ? "Editar agendamento" : "Novo agendamento"}</h2></div><button type="button" onClick={() => setModalAberto(false)}><X /></button></header>
            <form onSubmit={salvar}>
              {mensagem && <div className="ta-alerta"><AlertCircle size={17} />{mensagem}</div>}
              <div className="ta-form-grid">
                <label>Tipo de atendimento *
                  <select value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value, clinicaId: "", servicoId: "" }))}>
                    <option>Exame</option><option>Consulta</option>
                  </select>
                </label>
                <label>Clínica credenciada *
                  <select value={form.clinicaId} onChange={(e) => setForm((f) => ({ ...f, clinicaId: e.target.value, servicoId: "" }))}>
                    <option value="">Selecione uma clínica</option>
                    {clinicasDisponiveis.map((c) => <option key={c.id} value={c.id}>{c.nome}{c.regiao ? ` — ${c.regiao}` : ""}</option>)}
                  </select>
                </label>
                <label className="ta-full">Exame / Especialidade *
                  <select value={form.servicoId} onChange={(e) => atualizar("servicoId", e.target.value)} disabled={!clinicaSelecionada}>
                    <option value="">{clinicaSelecionada ? "Selecione o serviço" : "Selecione primeiro a clínica"}</option>
                    {servicosDisponiveis.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                  </select>
                  {clinicaSelecionada && servicosDisponiveis.length === 0 && <small>O catálogo não possui serviços detalhados para esta clínica. Confira o cadastro antes de agendar.</small>}
                </label>
                <label>Nome do paciente *
                  <input value={form.paciente} onChange={(e) => atualizar("paciente", e.target.value)} required />
                </label>
                <label>CPF
                  <input value={form.cpf} onChange={(e) => atualizar("cpf", e.target.value)} />
                </label>
                <label>Celular / WhatsApp
                  <input value={form.celular} onChange={(e) => atualizar("celular", e.target.value)} />
                </label>
                <label>Médico
                  <input value={form.medico} onChange={(e) => atualizar("medico", e.target.value)} placeholder="Opcional" />
                </label>
                <label>Data do agendamento *
                  <input type="date" value={form.data} onChange={(e) => atualizar("data", e.target.value)} required />
                </label>
                <label>Horário *
                  <input type="time" value={form.horario} onChange={(e) => atualizar("horario", e.target.value)} required />
                </label>
                <label>Status
                  <select value={form.status} onChange={(e) => atualizar("status", e.target.value)}>{STATUS.map((s) => <option key={s}>{s}</option>)}</select>
                </label>
                <label className="ta-full">Observações
                  <textarea rows="3" value={form.observacoes} onChange={(e) => atualizar("observacoes", e.target.value)} placeholder="Informações adicionais para controle interno..." />
                </label>
              </div>
              {clinicaSelecionada && (
                <div className="ta-clinica-info">
                  <strong><MapPin size={15} /> Dados da clínica</strong>
                  <span>{clinicaSelecionada.endereco || "Endereço não informado no catálogo"}</span>
                  <span>{clinicaSelecionada.contato || "Contato não informado no catálogo"}</span>
                </div>
              )}
              <footer><button className="ta-secondary" type="button" onClick={() => setModalAberto(false)}>Cancelar</button><button className="ta-primary" type="submit" disabled={salvando}>{salvando ? "Salvando..." : editandoId ? "Salvar alterações" : "Cadastrar agendamento"}</button></footer>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
