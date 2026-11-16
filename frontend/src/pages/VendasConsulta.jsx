
import React, { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db } from "../config/firebase";
import catalogoConsultas from "../data/catalogoConsultas";
import logotipo from "../assets/logotipo.jpg";
import {
  CalendarDays,
  Search,
  Plus,
  FileText,
  MessageCircle,
  Download,
  RefreshCw,
} from "lucide-react";
import "./VendasConsulta.css";

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

const moeda = (v) =>
  Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const texto = (v) => String(v ?? "").trim();

const lerValor = (v) => {
  if (typeof v === "number") return v;

  const m = String(v || "").match(
    /\d{1,3}(?:\.\d{3})*,\d{2}|\d+(?:\.\d+)?/
  );

  if (!m) return 0;

  const n = m[0].includes(",")
    ? m[0].replace(/\./g, "").replace(",", ".")
    : m[0];

  return Number(n) || 0;
};

const dataBR = (v) => {
  if (!v) return "—";

  if (typeof v?.toDate === "function") {
    return v.toDate().toLocaleDateString("pt-BR");
  }

  const d = new Date(`${String(v).slice(0, 10)}T12:00:00`);

  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("pt-BR");
};

const pegarNome = (c) =>
  c?.clinica || c?.nome || "Clínica não identificada";

export default function VendasConsulta({
  usuario,
  onNavigate,
  onCriarCheckoutConsulta,
}) {
  const [vendas, setVendas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [regiaoFiltro, setRegiaoFiltro] = useState("");
  const [regiaoForm, setRegiaoForm] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("");

  const [inicio, setInicio] = useState(
    hojeISO().slice(0, 7) + "-01"
  );

  const [fim, setFim] = useState(hojeISO());

  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [checkoutEmAndamento, setCheckoutEmAndamento] = useState("");
  const [guiaSelecionada, setGuiaSelecionada] = useState(null);

  const [form, setForm] = useState({
    clienteNome: "",
    clienteCPF: "",
    clienteTelefone: "",
    clinicaId: "",
    especialidade: "",
    medico: "",
    dataAgendamento: hojeISO(),
    horarioAgendamento: "",
    valor: "",
    statusAgendamento: "Aguardando confirmação",
    statusPagamento: "Não iniciado",
    observacoes: "",
    modalidade: "Presencial",
  });

  // ==========================================
  // CARREGAMENTO DAS VENDAS
  // ==========================================

  useEffect(() => {
    const q = query(
      collection(db, "vendasConsultas"),
      orderBy("criadoEm", "desc")
    );

    const cancelar = onSnapshot(
      q,
      (snap) => {
        setVendas(
          snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }))
        );

        setCarregando(false);
        setErro("");
      },
      (e) => {
        console.error(
          "Erro ao carregar vendas de consultas:",
          e
        );

        setErro(
          e.code === "permission-denied"
            ? "Sem permissão para consultar vendasConsultas. Verifique as regras do Firestore."
            : "Não foi possível carregar os agendamentos."
        );

        setCarregando(false);
      }
    );

    return () => cancelar();
  }, []);

  // ==========================================
  // CATÁLOGO DE CLÍNICAS
  // ==========================================

  const clinicas = useMemo(
    () => catalogoConsultas?.clinicas || [],
    []
  );

  const clinicaSelecionada = clinicas.find(
    (c) => c.id === form.clinicaId
  ) || null;

  const especialidades = useMemo(() => {
    if (!clinicaSelecionada) return [];

    return (clinicaSelecionada.servicos || [])
      .map((s) => ({
        ...s,
        especialidade: s.especialidade || s.nome,
      }))
      .filter((s) => s.especialidade);
  }, [clinicaSelecionada]);

  const servicoSelecionado = especialidades.find(
    (s) => s.especialidade === form.especialidade
  );

  useEffect(() => {
    if (servicoSelecionado && !form.valor) {
      const v = lerValor(
        servicoSelecionado.valorTexto ||
        servicoSelecionado.valorNumerico
      );

      if (v) {
        setForm((f) => ({
          ...f,
          valor: String(v.toFixed(2)),
        }));
      }
    }
  }, [servicoSelecionado, form.valor]);

  const regioes = useMemo(
    () =>
      [
        ...new Set(
          clinicas.map((c) => c.regiao).filter(Boolean)
        ),
      ].sort(),
    [clinicas]
  );

  // ==========================================
  // FILTROS
  // ==========================================

  const vendasFiltradas = useMemo(
    () =>
      vendas.filter((v) => {
        const data = texto(
          v.dataAgendamento ||
          v.dataVenda ||
          v.criadoEm?.toDate?.().toISOString()
        ).slice(0, 10);

        if (data && (data < inicio || data > fim)) {
          return false;
        }

        if (
          regiaoFiltro &&
          v.regiao !== regiaoFiltro
        ) {
          return false;
        }

        if (
          statusFiltro &&
          v.statusAgendamento !== statusFiltro
        ) {
          return false;
        }

        const termo = normalizar(busca);

        if (
          termo &&
          ![
            v.clienteNome,
            v.clienteCPF,
            v.clinicaNome,
            v.especialidade,
            v.medico,
            v.responsavelNome,
          ].some((x) => normalizar(x).includes(termo))
        ) {
          return false;
        }

        return true;
      }),
    [
      vendas,
      inicio,
      fim,
      regiaoFiltro,
      statusFiltro,
      busca,
    ]
  );

  const confirmados = vendasFiltradas.filter(
    (v) =>
      normalizar(v.statusAgendamento) === "confirmado"
  );

  const valorVendido = vendasFiltradas.reduce(
    (s, v) => s + Number(v.valor || 0),
    0
  );

  const valorConfirmado = confirmados.reduce(
    (s, v) => s + Number(v.valor || 0),
    0
  );

  // ==========================================
  // ATUALIZAÇÃO DO FORMULÁRIO
  // ==========================================

  function atualizar(campo, valor) {
    setForm((f) => ({
      ...f,
      [campo]: valor,
    }));
  }

  // ==========================================
  // SALVAR AGENDAMENTO
  // ==========================================

  async function salvarAgendamento(e) {
    e.preventDefault();

    if (
      !form.clienteNome ||
      !form.clinicaId ||
      !form.especialidade ||
      !form.dataAgendamento ||
      !form.horarioAgendamento
    ) {
      alert(
        "Preencha cliente, clínica, especialidade, data e horário."
      );
      return;
    }

    const auth = getAuth();

    const uid =
      usuario?.uid ||
      auth.currentUser?.uid ||
      "";

    if (!uid) {
      alert(
        "Sua sessão expirou. Entre novamente no sistema."
      );
      return;
    }

    setSalvando(true);

    try {
      const registro = {
        tipoRegistro: "vendaConsulta",
        origem: "Vendas de Consultas",

        clienteNome: texto(form.clienteNome),
        clienteCPF: texto(form.clienteCPF),
        clienteTelefone: texto(form.clienteTelefone),

        clinicaId: clinicaSelecionada.id,
        clinicaNome: pegarNome(clinicaSelecionada),
        clinicaEndereco:
          clinicaSelecionada.endereco || "",
        clinicaContato:
          clinicaSelecionada.contato || "",

        regiao: clinicaSelecionada.regiao || "",
        categoriaPlano:
          clinicaSelecionada.categoriaPlano || "",

        especialidade: texto(form.especialidade),
        medico: texto(form.medico),

        dataAgendamento: form.dataAgendamento,
        horarioAgendamento: form.horarioAgendamento,

        modalidade: form.modalidade,

        valor: Number(form.valor || 0),
        valorTotal: Number(form.valor || 0),

        statusAgendamento: form.statusAgendamento,

        // O pagamento não pode ser marcado manualmente como pago.
        // A confirmação deverá vir do webhook do provedor.
        statusPagamento: "Não iniciado",
        pagamentoConfirmado: false,
        checkoutStatus: "nao_iniciado",

        observacoes: texto(form.observacoes),

        vendedorId: uid,

        responsavelNome:
          usuario?.displayName ||
          usuario?.nome ||
          auth.currentUser?.displayName ||
          auth.currentUser?.email ||
          "Não informado",

        criadoEm: serverTimestamp(),
        atualizadoEm: serverTimestamp(),

        guiaEmitida: false,
      };

      const ref = await addDoc(
        collection(db, "vendasConsultas"),
        registro
      );

      setGuiaSelecionada({
        id: ref.id,
        ...registro,
        criadoEm: new Date(),
      });

      setMostrarFormulario(false);

      setForm({
        clienteNome: "",
        clienteCPF: "",
        clienteTelefone: "",
        clinicaId: "",
        especialidade: "",
        medico: "",
        dataAgendamento: hojeISO(),
        horarioAgendamento: "",
        valor: "",
        statusAgendamento: "Aguardando confirmação",
        statusPagamento: "Não iniciado",
        observacoes: "",
        modalidade: "Presencial",
      });

      setRegiaoForm("");
    } catch (e2) {
      console.error(
        "Erro ao salvar agendamento:",
        e2
      );

      alert(
        "Não foi possível salvar. Verifique as permissões da coleção vendasConsultas no Firestore."
      );
    } finally {
      setSalvando(false);
    }
  }

  // ==========================================
  // ESCAPAR HTML
  // ==========================================

  function escaparHTML(valor) {
    return String(valor ?? "—").replace(
      /[&<>"']/g,
      (c) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      }[c])
    );
  }

  // ==========================================
  // ENVIAR GUIA PELO WHATSAPP
  // ==========================================

  function enviarWhatsApp(v) {
    const telefone = String(
      v.clienteTelefone || ""
    ).replace(/\D/g, "");

    if (!telefone) {
      alert(
        "Cadastre o WhatsApp do cliente para enviar a guia."
      );
      return;
    }

    const msg =
      `GUIA DE AGENDAMENTO — DOUTOR SAÚDE FAMILIAR\n` +
      `CNPJ: 11.948.609/0001-03\n` +
      `Telefones: (11) 4395-6295 | (11) 3777-8504\n\n` +
      `Guia: ${v.id}\n` +
      `Cliente: ${v.clienteNome}\n` +
      `CPF: ${v.clienteCPF || "Não informado"}\n` +
      `Clínica: ${v.clinicaNome}\n` +
      `Endereço: ${v.clinicaEndereco || "Consulte a clínica"}\n` +
      `Contato da clínica: ${v.clinicaContato || "Não informado"}\n` +
      `Especialidade: ${v.especialidade}\n` +
      `Médico(a): ${v.medico || "A confirmar pela clínica"}\n` +
      `Data: ${dataBR(v.dataAgendamento)}\n` +
      `Horário: ${v.horarioAgendamento}\n` +
      `Modalidade: ${v.modalidade || "Presencial"}\n` +
      `Valor: ${moeda(v.valor)}\n` +
      `Status do agendamento: ${v.statusAgendamento}\n` +
      `Status do pagamento: ${v.statusPagamento || "Não iniciado"}\n\n` +
      `Apresente esta guia no atendimento. A confirmação do agendamento e a disponibilidade devem ser observadas junto à clínica.\n` +
      `Dúvidas: (11) 4395-6295 ou (11) 3777-8504.`;

    const url =
      `https://wa.me/${telefone}?text=${encodeURIComponent(msg)}`;

    window.open(
      url,
      "_blank",
      "noopener,noreferrer"
    );
  }

  // ==========================================
  // GERAR GUIA DE AGENDAMENTO
  // ==========================================

  function imprimirGuia(v) {
    const w = window.open(
      "",
      "_blank",
      "width=1000,height=850"
    );

    if (!w) {
      alert(
        "Permita pop-ups para gerar a guia de agendamento."
      );
      return;
    }

    const logoUrl = logotipo;

    const statusPagamento =
      v.statusPagamento || "Não iniciado";

    const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Guia de Agendamento - Doutor Saúde Familiar</title>

<style>
  @page {
    size: A4;
    margin: 17mm;
  }

  * {
    box-sizing: border-box;
  }

  body {
    font: 13px Arial, sans-serif;
    color: #243447;
    margin: 0;
    background: #fff;
  }

  .topo {
    display: flex;
    align-items: center;
    gap: 22px;
    border-bottom: 3px solid #29465f;
    padding-bottom: 15px;
  }

  .logo {
    max-width: 170px;
    max-height: 85px;
    object-fit: contain;
  }

  .empresa h1 {
    font-size: 21px;
    color: #29465f;
    margin: 0 0 6px;
  }

  .empresa p {
    margin: 3px 0;
    color: #526477;
    font-size: 12px;
  }

  h2 {
    color: #29465f;
    margin: 23px 0 12px;
    font-size: 19px;
  }

  .numero-guia {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: center;
    background: #eef3f7;
    border: 1px solid #d7e0e8;
    border-radius: 7px;
    padding: 11px 13px;
    margin-bottom: 14px;
  }

  .numero-guia strong {
    color: #29465f;
  }

  .cliente {
    background: #f3f6f9;
    padding: 14px;
    border-radius: 7px;
    line-height: 1.8;
    margin-bottom: 16px;
  }

  .secao {
    font-size: 14px;
    color: #29465f;
    margin: 18px 0 8px;
    font-weight: bold;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 8px;
    font-size: 12px;
  }

  th {
    background: #29465f;
    color: #fff;
    text-align: left;
  }

  th, td {
    padding: 10px 9px;
    border: 1px solid #d7e0e8;
    vertical-align: top;
  }

  .status {
    display: inline-block;
    padding: 6px 10px;
    border-radius: 20px;
    background: #eef2f7;
    color: #334155;
    font-weight: bold;
  }

  .observacao {
    margin-top: 18px;
    padding: 12px;
    background: #f8fafc;
    border-left: 3px solid #29465f;
    color: #526477;
    line-height: 1.6;
  }

  .rodape {
    margin-top: 28px;
    padding-top: 12px;
    border-top: 1px solid #d7e0e8;
    color: #64748b;
    font-size: 10px;
    line-height: 1.6;
  }

  .assinatura {
    margin-top: 42px;
    border-top: 1px solid #64748b;
    width: 270px;
    padding-top: 7px;
    color: #526477;
    font-size: 11px;
  }

  @media print {
    body {
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }
  }
</style>
</head>

<body>

<header class="topo">

  <img
    class="logo"
    src="${logoUrl}"
    alt="Logo Doutor Saúde Familiar"
  >

  <div class="empresa">

    <h1>Doutor Saúde Familiar</h1>

    <p>
      <strong>CNPJ:</strong>
      11.948.609/0001-03
    </p>

    <p>
      <strong>Telefones:</strong>
      (11) 4395-6295 | (11) 3777-8504
    </p>

  </div>

</header>

<h2>Guia de agendamento de consulta</h2>

<div class="numero-guia">

  <span>
    <strong>Nº da guia:</strong>
    ${escaparHTML(v.id)}
  </span>

  <span>
    <strong>Emitida em:</strong>
    ${new Date().toLocaleDateString("pt-BR")}
  </span>

</div>

<div class="cliente">

  <strong>Cliente:</strong>
  ${escaparHTML(v.clienteNome)}
  <br>

  <strong>CPF:</strong>
  ${escaparHTML(v.clienteCPF || "Não informado")}
  <br>

  <strong>Telefone:</strong>
  ${escaparHTML(v.clienteTelefone || "Não informado")}

</div>

<div class="secao">
  Dados do atendimento
</div>

<table>
<tbody>

<tr>
  <th>Clínica credenciada</th>
  <td>${escaparHTML(v.clinicaNome)}</td>
</tr>

<tr>
  <th>Endereço</th>
  <td>${escaparHTML(v.clinicaEndereco || "Não informado no cadastro")}</td>
</tr>

<tr>
  <th>Contato da clínica</th>
  <td>${escaparHTML(v.clinicaContato || "Não informado no cadastro")}</td>
</tr>

<tr>
  <th>Especialidade / serviço</th>
  <td>${escaparHTML(v.especialidade)}</td>
</tr>

<tr>
  <th>Médico(a)</th>
  <td>${escaparHTML(v.medico || "A confirmar pela clínica")}</td>
</tr>

<tr>
  <th>Data</th>
  <td>${escaparHTML(dataBR(v.dataAgendamento))}</td>
</tr>

<tr>
  <th>Horário</th>
  <td>${escaparHTML(v.horarioAgendamento)}</td>
</tr>

<tr>
  <th>Modalidade</th>
  <td>${escaparHTML(v.modalidade || "Presencial")}</td>
</tr>

<tr>
  <th>Região</th>
  <td>${escaparHTML(v.regiao || "—")}</td>
</tr>

</tbody>
</table>

<div class="secao">
  Valores e situação
</div>

<table>
<tbody>

<tr>
  <th>Valor da consulta</th>
  <td>
    <strong>${moeda(v.valor)}</strong>
  </td>
</tr>

<tr>
  <th>Status do agendamento</th>
  <td>
    <span class="status">
      ${escaparHTML(v.statusAgendamento || "Aguardando confirmação")}
    </span>
  </td>
</tr>

<tr>
  <th>Status do pagamento</th>
  <td>
    <span class="status">
      ${escaparHTML(statusPagamento)}
    </span>
  </td>
</tr>

</tbody>
</table>

${
  v.observacoes
    ? `
      <div class="observacao">
        <strong>Observações:</strong>
        <br>
        ${escaparHTML(v.observacoes)}
      </div>
    `
    : ""
}

<div class="observacao">

  Apresente esta guia à clínica no dia do atendimento.

  Esta guia registra os dados do agendamento no sistema
  da Doutor Saúde Familiar; a disponibilidade, confirmação
  final do horário e realização do atendimento dependem
  da clínica credenciada.

  A guia não substitui eventual comprovante de pagamento.

</div>

<div class="assinatura">
  Doutor Saúde Familiar
</div>

<footer class="rodape">

  Doutor Saúde Familiar ·
  CNPJ 11.948.609/0001-03 ·
  Telefones: (11) 4395-6295 | (11) 3777-8504

  <br>

  Documento gerado eletronicamente pelo sistema.
  Em caso de divergência nos dados, entre em contato
  com nossa equipe.

</footer>

<script>
  window.addEventListener("load", () => {

    const img = document.querySelector(".logo");

    const imprimir = () =>
      setTimeout(() => window.print(), 250);

    if (!img || img.complete) {
      imprimir();
    } else {
      img.onload = imprimir;
      img.onerror = imprimir;

      setTimeout(imprimir, 2000);
    }

  });
</script>

</body>
</html>`;

    w.document.open();
    w.document.write(html);
    w.document.close();
  }

  // ==========================================
  // INICIAR COBRANÇA DA CONSULTA
  // ==========================================

  async function cobrarConsulta(v) {
    if (
      v.statusPagamento === "Pago" ||
      v.pagamentoConfirmado === true
    ) {
      alert("Esta consulta já consta como paga.");
      return;
    }

    if (typeof onCriarCheckoutConsulta !== "function") {
      alert(
        "O checkout de consultas ainda não foi conectado no App.jsx e no backend. Nenhuma cobrança foi criada."
      );
      return;
    }

    if (!(Number(v.valorTotal ?? v.valor) > 0)) {
      alert(
        "Informe um valor válido para gerar a cobrança."
      );
      return;
    }

    setCheckoutEmAndamento(v.id);

    try {
      const resposta = await onCriarCheckoutConsulta({
        vendaId: v.id,

        valorTotal: Number(
          v.valorTotal ?? v.valor
        ),

        cliente: {
          nome: v.clienteNome,
          cpf: v.clienteCPF,
          telefone: v.clienteTelefone,
        },

        descricao:
          `Consulta ${v.especialidade} - ${v.clinicaNome}`,

        origem: "vendasConsultas",
      });

      if (!resposta || resposta.ok === false) {
        throw new Error(
          resposta?.message ||
          "Não foi possível iniciar a cobrança."
        );
      }

      if (resposta.checkoutUrl) {
        window.open(
          resposta.checkoutUrl,
          "_blank",
          "noopener,noreferrer"
        );
      } else if (resposta.url) {
        window.open(
          resposta.url,
          "_blank",
          "noopener,noreferrer"
        );
      }

    } catch (e) {
      console.error(
        "Erro ao iniciar cobrança da consulta:",
        e
      );

      alert(
        e.message ||
        "Não foi possível iniciar a cobrança."
      );

    } finally {
      setCheckoutEmAndamento("");
    }
  }

  // ==========================================
  // EXPORTAR CSV
  // ==========================================

  function exportarCSV() {
    const cab = [
      "ID",
      "Data agendada",
      "Horário",
      "Cliente",
      "CPF",
      "Telefone",
      "Clínica",
      "Endereço",
      "Região",
      "Especialidade",
      "Médico",
      "Modalidade",
      "Valor",
      "Status agendamento",
      "Status pagamento",
      "Responsável",
    ];

    const linhas = vendasFiltradas.map((v) => [
      v.id,
      v.dataAgendamento,
      v.horarioAgendamento,
      v.clienteNome,
      v.clienteCPF,
      v.clienteTelefone,
      v.clinicaNome,
      v.clinicaEndereco,
      v.regiao,
      v.especialidade,
      v.medico,
      v.modalidade,
      v.valor,
      v.statusAgendamento,
      v.statusPagamento,
      v.responsavelNome,
    ]);

    const csv = [cab, ...linhas]
      .map((row) =>
        row
          .map(
            (x) =>
              `"${String(x ?? "").replace(/"/g, '""')}"`
          )
          .join(";")
      )
      .join("\n");

    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + csv], {
        type: "text/csv;charset=utf-8;",
      })
    );

    const a = document.createElement("a");

    a.href = url;
    a.download = "relatorio-vendas-consultas.csv";
    a.click();

    URL.revokeObjectURL(url);
  }

  // ==========================================
  // INTERFACE
  // ==========================================

  return (
    <main className="vendas-consultas">

      <header className="vc-topo">

        <div>
          <h1>Vendas de Consultas e Agendamentos</h1>

          <p>
            Consulte clínicas credenciadas, registre vendas
            e acompanhe agendamentos.
          </p>
        </div>

        <button
          onClick={() =>
            setMostrarFormulario((x) => !x)
          }
          className="vc-botao-principal"
        >
          <Plus size={17} />
          Nova venda / agendamento
        </button>

      </header>

      {erro && (
        <div className="vc-alerta">
          {erro}
        </div>
      )}

      {/* INDICADORES */}

      <section className="vc-indicadores">

        <article>
          <span>Vendas filtradas</span>
          <strong>{vendasFiltradas.length}</strong>
        </article>

        <article>
          <span>Agendamentos confirmados</span>
          <strong>{confirmados.length}</strong>
        </article>

        <article>
          <span>Valor vendido</span>
          <strong>{moeda(valorVendido)}</strong>
        </article>

        <article>
          <span>Valor de agendamentos confirmados</span>
          <strong>{moeda(valorConfirmado)}</strong>
        </article>

      </section>

      {/* FORMULÁRIO */}

      {mostrarFormulario && (

        <form
          className="vc-formulario"
          onSubmit={salvarAgendamento}
        >

          <h2>Registrar venda e agendamento</h2>

          <div className="vc-grid">

            <label>
              Nome do cliente *

              <input
                value={form.clienteNome}
                onChange={(e) =>
                  atualizar("clienteNome", e.target.value)
                }
                required
              />
            </label>

            <label>
              CPF

              <input
                value={form.clienteCPF}
                onChange={(e) =>
                  atualizar("clienteCPF", e.target.value)
                }
              />
            </label>

            <label>
              WhatsApp do cliente

              <input
                value={form.clienteTelefone}
                onChange={(e) =>
                  atualizar("clienteTelefone", e.target.value)
                }
                placeholder="5511999999999"
              />
            </label>

            <label>
              Região

              <select
                value={regiaoForm}
                onChange={(e) => {
                  setRegiaoForm(e.target.value);

                  atualizar("clinicaId", "");
                  atualizar("especialidade", "");
                  atualizar("valor", "");
                }}
              >
                <option value="">
                  Todas as regiões
                </option>

                {regioes.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>

            <label className="vc-largo">
              Clínica credenciada *

              <select
                value={form.clinicaId}
                onChange={(e) => {
                  setForm((f) => ({
                    ...f,
                    clinicaId: e.target.value,
                    especialidade: "",
                    valor: "",
                  }));
                }}
                required
              >
                <option value="">
                  Selecione a clínica
                </option>

                {clinicas
                  .filter(
                    (c) =>
                      !regiaoForm ||
                      c.regiao === regiaoForm
                  )
                  .map((c) => (
                    <option
                      key={c.id}
                      value={c.id}
                    >
                      {c.clinica} — {c.regiao} (
                      {c.categoriaPlano})
                    </option>
                  ))}
              </select>
            </label>

            {clinicaSelecionada && (

              <div className="vc-info-clinica vc-largo">

                <b>{clinicaSelecionada.clinica}</b>

                <span>
                  {clinicaSelecionada.endereco ||
                    "Endereço não informado na planilha"}
                </span>

                <span>
                  {clinicaSelecionada.contato ||
                    "Contato não informado na planilha"}
                </span>

              </div>

            )}

            <label>
              Especialidade / serviço *

              <select
                value={form.especialidade}
                onChange={(e) => {
                  const serv = especialidades.find(
                    (s) =>
                      s.especialidade === e.target.value
                  );

                  atualizar(
                    "especialidade",
                    e.target.value
                  );

                  atualizar(
                    "valor",
                    String(
                      lerValor(
                        serv?.valorTexto ||
                        serv?.valorNumerico
                      ) || ""
                    )
                  );
                }}
                required
                disabled={!clinicaSelecionada}
              >
                <option value="">
                  Selecione
                </option>

                {especialidades.map((s, i) => (
                  <option
                    key={`${s.especialidade}-${i}`}
                    value={s.especialidade}
                  >
                    {s.especialidade}
                    {s.valorTexto
                      ? ` — ${s.valorTexto}`
                      : ""}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Médico(a) responsável

              <input
                list="vc-medicos-catalogo"
                value={form.medico}
                onChange={(e) =>
                  atualizar("medico", e.target.value)
                }
                placeholder="Nome confirmado pela clínica"
              />

              <datalist id="vc-medicos-catalogo">
                {(catalogoConsultas.profissionaisRelacionados || [])
                  .map((p, i) => (
                    <option
                      key={`${p.medico}-${i}`}
                      value={p.medico}
                    >
                      {p.especialidade}
                    </option>
                  ))}
              </datalist>
            </label>

            <label>
              Data do agendamento *

              <input
                type="date"
                value={form.dataAgendamento}
                onChange={(e) =>
                  atualizar("dataAgendamento", e.target.value)
                }
                required
              />
            </label>

            <label>
              Horário *

              <input
                type="time"
                value={form.horarioAgendamento}
                onChange={(e) =>
                  atualizar("horarioAgendamento", e.target.value)
                }
                required
              />
            </label>

            <label>
              Valor da consulta (R$)

              <input
                type="number"
                min="0"
                step="0.01"
                value={form.valor}
                onChange={(e) =>
                  atualizar("valor", e.target.value)
                }
              />
            </label>

            <label>
              Modalidade

              <select
                value={form.modalidade}
                onChange={(e) =>
                  atualizar("modalidade", e.target.value)
                }
              >
                <option>Presencial</option>
                <option>Online</option>
              </select>
            </label>

            <label>
              Status do agendamento

              <select
                value={form.statusAgendamento}
                onChange={(e) =>
                  atualizar(
                    "statusAgendamento",
                    e.target.value
                  )
                }
              >
                <option>Aguardando confirmação</option>
                <option>Confirmado</option>
                <option>Realizado</option>
                <option>Cancelado</option>
                <option>Não compareceu</option>
              </select>
            </label>

            <div className="vc-info-clinica">
              <b>Pagamento</b>

              <span>
                O status será atualizado automaticamente
                após a confirmação da cobrança pelo sistema.
              </span>
            </div>

            <label className="vc-largo">
              Observações

              <textarea
                rows="3"
                value={form.observacoes}
                onChange={(e) =>
                  atualizar("observacoes", e.target.value)
                }
              />
            </label>

          </div>

          <div className="vc-acoes">

            <button
              type="button"
              className="vc-secundario"
              onClick={() => setMostrarFormulario(false)}
            >
              Cancelar
            </button>

            <button
              disabled={salvando}
              className="vc-botao-principal"
              type="submit"
            >
              {salvando
                ? "Salvando..."
                : "Salvar venda e agendamento"}
            </button>

          </div>

        </form>

      )}

      {/* FILTROS */}

      <section className="vc-filtros">

        <label>
          <span>
            Pesquisar cliente, clínica, médico ou especialidade
          </span>

          <div className="vc-busca">
            <Search size={17} />

            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Digite para pesquisar"
            />
          </div>
        </label>

        <label>
          <span>Data inicial</span>

          <input
            type="date"
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
          />
        </label>

        <label>
          <span>Data final</span>

          <input
            type="date"
            value={fim}
            onChange={(e) => setFim(e.target.value)}
          />
        </label>

        <label>
          <span>Região</span>

          <select
            value={regiaoFiltro}
            onChange={(e) => setRegiaoFiltro(e.target.value)}
          >
            <option value="">Todas</option>

            {regioes.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>

        <label>
          <span>Status</span>

          <select
            value={statusFiltro}
            onChange={(e) => setStatusFiltro(e.target.value)}
          >
            <option value="">Todos</option>

            {[
              "Aguardando confirmação",
              "Confirmado",
              "Realizado",
              "Cancelado",
              "Não compareceu",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>

        <button
          className="vc-secundario"
          onClick={exportarCSV}
        >
          <Download size={16} />
          Exportar CSV
        </button>

      </section>

      {/* TABELA */}

      <section className="vc-tabela-card">

        <div className="vc-tabela-titulo">

          <h2>Vendas e agendamentos</h2>

          <span>
            {vendasFiltradas.length} registro(s)
          </span>

        </div>

        {carregando ? (

          <p className="vc-vazio">
            <RefreshCw size={18} />
            Carregando...
          </p>

        ) : (

          <div className="vc-tabela-scroll">

            <table>

              <thead>
                <tr>
                  <th>Data / hora</th>
                  <th>Cliente</th>
                  <th>Clínica</th>
                  <th>Especialidade</th>
                  <th>Médico</th>
                  <th>Valor</th>
                  <th>Agendamento</th>
                  <th>Pagamento</th>
                  <th>Ações</th>
                </tr>
              </thead>

              <tbody>

                {vendasFiltradas.map((v) => (

                  <tr key={v.id}>

                    <td>
                      {dataBR(v.dataAgendamento)}
                      <br />
                      <b>
                        {v.horarioAgendamento || "—"}
                      </b>
                    </td>

                    <td>
                      {v.clienteNome}
                      <small>
                        {v.clienteTelefone}
                      </small>
                    </td>

                    <td>
                      {v.clinicaNome}
                      <small>{v.regiao}</small>
                    </td>

                    <td>{v.especialidade}</td>

                    <td>{v.medico || "A confirmar"}</td>

                    <td>{moeda(v.valor)}</td>

                    <td>
                      <span
                        className={`vc-status ${normalizar(
                          v.statusAgendamento
                        ).replace(/\s/g, "-")}`}
                      >
                        {v.statusAgendamento}
                      </span>
                    </td>

                    <td>
                      {v.statusPagamento || "Não iniciado"}
                    </td>

                    <td>
                      <div className="vc-acoes-linha">

                        <button
                          title="Gerar guia"
                          onClick={() => imprimirGuia(v)}
                        >
                          <FileText size={16} />
                        </button>

                        <button
                          title="Enviar guia pelo WhatsApp"
                          onClick={() => enviarWhatsApp(v)}
                        >
                          <MessageCircle size={16} />
                        </button>

                        <button
                          title="Gerar cobrança"
                          disabled={
                            checkoutEmAndamento === v.id ||
                            v.statusPagamento === "Pago" ||
                            v.pagamentoConfirmado === true
                          }
                          onClick={() => cobrarConsulta(v)}
                        >
                          {checkoutEmAndamento === v.id
                            ? "..."
                            : "Cobrar"}
                        </button>

                      </div>
                    </td>

                  </tr>

                ))}

              </tbody>

            </table>

            {!vendasFiltradas.length && (
              <p className="vc-vazio">
                Nenhuma venda ou consulta encontrada com esses filtros.
              </p>
            )}

          </div>

        )}

      </section>

      {/* MODAL DE VENDA REGISTRADA */}

      {guiaSelecionada && (

        <div
          className="vc-modal-fundo"
          role="presentation"
        >

          <div className="vc-modal">

            <button
              className="vc-fechar"
              onClick={() => setGuiaSelecionada(null)}
            >
              ×
            </button>

            <h2>Venda registrada!</h2>

            <p>
              O agendamento foi salvo. Você já pode gerar
              a guia ou enviá-la ao cliente.
            </p>

            <div className="vc-acoes">

              <button
                className="vc-secundario"
                onClick={() => imprimirGuia(guiaSelecionada)}
              >
                <FileText size={16} />
                Gerar guia
              </button>

              <button
                className="vc-botao-principal"
                onClick={() => enviarWhatsApp(guiaSelecionada)}
              >
                <MessageCircle size={16} />
                Enviar pelo WhatsApp
              </button>

            </div>

          </div>

        </div>

      )}

    </main>
  );
}
