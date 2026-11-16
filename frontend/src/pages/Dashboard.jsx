import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import { Download, Filter, FileBarChart2 } from "lucide-react";
import "./Dashboard.css";

const DEPARTAMENTOS_PADRAO = [
  { id: "comercial-exames", nome: "Comercial Exames" },
  { id: "comercial-google", nome: "Comercial Google" },
  { id: "comercial-lead", nome: "Comercial Lead" },
  { id: "comercial-vendas", nome: "Comercial Vendas" },
];

const FORMAS_PAGAMENTO = [
  "Pix", "Boleto", "Cartão", "ENEL", "Pix Mensalista",
  "EDP", "Link", "Asaas", "Pagar.me",
];

const ORIGENS = [
  "Ativo", "Google", "Indicação", "Lead", "Receptivo",
  "Renovação", "UP", "Recuperação", "Site",
];

const TIPOS = [
  "Google", "Indicação", "Lead", "Renovação", "UP", "Recuperação",
];

const CORES = [
  "#ed7d7d", "#e9b17b", "#b1e77d", "#e9e77b", "#75dddd",
  "#8c83e8", "#79afe5", "#a68ce8", "#83c9a5",
];

const normalizar = (valor) =>
  String(valor ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const moeda = (valor) =>
  Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const numero = (valor) =>
  Number(valor || 0).toLocaleString("pt-BR");

function dataInput(data) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function converterData(valor) {
  if (!valor) return null;
  if (typeof valor.toDate === "function") return valor.toDate();
  if (valor instanceof Date) return valor;

  if (typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    const [ano, mes, dia] = valor.split("-").map(Number);
    return new Date(ano, mes - 1, dia);
  }

  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
}

function obterData(item) {
  // Para relatórios de vendas, prioriza a data em que a venda foi criada.
  // A data do pagamento fica reservada aos relatórios financeiros.
  return converterData(
    item.dataVenda ||
    item.criadoEm ||
    item.createdAt ||
    item.dataCriacao ||
    item.dataContrato ||
    item.data ||
    item.timestamp ||
    item.dataPagamento ||
    item.dataRecebimento ||
    item.pagoEm
  );
}

function obterDataPagamento(item) {
  return converterData(
    item.dataPagamento ||
    item.pagoEm ||
    item.dataRecebimento ||
    item.recebidoEm ||
    item.atualizadoEm ||
    item.criadoEm ||
    item.createdAt
  );
}

function obterIdVenda(item) {
  return String(item.vendaId || item.contratoId || item.idVenda || item.id || "");
}

function obterItensExame(item) {
  const itens = Array.isArray(item.itens) ? item.itens : [];

  return itens.map((exame) => {
    const clinica =
      exame.clinicaNome ||
      exame.nomeClinica ||
      exame.clinica?.nome ||
      exame.unidadeNome ||
      exame.estabelecimentoNome ||
      exame.laboratorioNome ||
      exame.prestadorNome ||
      item.clinicaNome ||
      item.nomeClinica ||
      item.clinica?.nome ||
      item.unidadeNome ||
      item.estabelecimentoNome ||
      item.laboratorioNome ||
      item.prestadorNome ||
      "Clínica não informada";

    const cidade =
      exame.cidadeClinica ||
      exame.clinicaCidade ||
      exame.cidade ||
      exame.clinica?.cidade ||
      item.cidadeClinica ||
      item.clinicaCidade ||
      item.cidade ||
      "";

    const dataExame = converterData(
      exame.dataRealizacao ||
      exame.dataExame ||
      exame.dataAgendamento ||
      exame.dataConsulta ||
      item.dataRealizacao ||
      item.dataExame ||
      item.dataAgendamento ||
      item.dataVenda ||
      item.criadoEm ||
      item.createdAt
    );

    return {
      nome:
        exame.exameNome ||
        exame.nomeExame ||
        exame.procedimentoNome ||
        exame.nome ||
        exame.exame ||
        exame.descricao ||
        exame.titulo ||
        exame.procedimento?.nome ||
        "Exame não identificado",
      quantidade: Math.max(1, Number(exame.quantidade || 1)),
      valor: Number(
        exame.valorTotal ??
        exame.valorDoutorTodos ??
        exame.valor ??
        exame.preco ??
        exame.valorUnitario ??
        0
      ),
      clinica,
      cidade,
      dataExame,
    };
  });
}

function obterQuantidadeItensExame(item) {
  return obterItensExame(item).reduce((total, exame) => total + exame.quantidade, 0);
}

function obterValorExames(item) {
  return Number(item.valorTotal ?? item.valor ?? item.total ?? 0);
}

function obterStatusVenda(item) {
  return normalizar(
    item.statusVendaLabel ||
    item.statusVenda ||
    item.statusLabel ||
    item.status ||
    ""
  );
}

function ehVendaCancelada(item) {
  const campos = [
    item.statusVendaLabel,
    item.statusVenda,
    item.statusLabel,
    item.status,
    item.situacaoVenda,
    item.statusContrato,
  ];

  return campos.some((campo) => {
    const status = normalizar(campo);
    return ["cancelado", "cancelada", "canceled", "cancelled"].some(
      (termo) => status.includes(termo)
    );
  });
}

function obterStatusPagamento(item) {
  return normalizar(
    item.statusPagamentoLabel ||
    item.statusPagamento ||
    item.pagamentoStatus ||
    item.checkoutStatus ||
    item.status ||
    item.situacaoPagamento ||
    ""
  );
}

function obterValorContrato(item) {
  return Number(
    item.valorContratado ??
    item.valorPlano ??
    item.valorTotal ??
    item.valor ??
    0
  );
}

function obterValorPagamento(item) {
  return Number(
    item.valorRecebido ??
    item.valorPago ??
    item.valor ??
    item.total ??
    0
  );
}

function obterOrigem(item) {
  return item.origem ||
    item.origemCadastro ||
    item.canalOrigem ||
    item.canalVenda ||
    "";
}

function obterTipo(item) {
  return item.tipoVenda ||
    item.tipoContrato ||
    item.tipoOperacao ||
    "";
}

function obterDepartamento(item) {
  return normalizar(
    item.departamentoId ||
    item.departamento ||
    item.nomeDepartamento ||
    item.departamentoNome
  );
}

function obterResponsavelId(item) {
  return String(
    item.vendedorId ||
    item.usuarioId ||
    item.responsavelId ||
    ""
  );
}

function obterResponsavelNome(item) {
  return item.vendedorNome ||
    item.usuarioNome ||
    item.responsavelNome ||
    item.nomeVendedor ||
    "Não informado";
}

function obterFormaPagamento(item) {
  const forma = normalizar(
    item.formaPagamento ||
    item.metodoPagamento ||
    item.meioPagamento ||
    item.tipoPagamento
  );

  if (forma) {
    if (
      forma === "credito" ||
      forma === "debito" ||
      forma === "cartao de credito" ||
      forma === "cartao de debito"
    ) return "cartao";

    if (forma === "pix mensal") return "pix mensalista";
    if (forma === "pagarme") return "pagar.me";

    return forma;
  }

  const provedor = normalizar(
    item.provedor || item.gateway || item.processador
  );

  if (provedor.includes("asaas")) return "asaas";
  if (provedor.includes("pagar.me") || provedor.includes("pagarme")) {
    return "pagar.me";
  }

  return "nao informado";
}

function pagamentoConfirmado(item) {
  if (
    item.pagamentoConfirmado === true ||
    item.pago === true ||
    item.paid === true ||
    item.confirmado === true
  ) return true;

  return [
    "pago", "paga", "paid", "confirmado",
    "recebido", "concluido", "aprovado", "succeeded",
  ].includes(normalizar(
    item.statusPagamentoLabel ||
    item.statusPagamento ||
    item.status ||
    item.situacaoPagamento
  ));
}

function dentroDoPeriodo(data, inicio, fim) {
  if (!data) return false;

  const dataInicio = new Date(`${inicio}T00:00:00`);
  const dataFim = new Date(`${fim}T23:59:59.999`);

  return data >= dataInicio && data <= dataFim;
}

function pertenceAoDepartamento(
  item,
  departamentoSelecionado,
  departamentosDisponiveis = DEPARTAMENTOS_PADRAO
) {
  if (!departamentoSelecionado) return true;

  const departamento = departamentosDisponiveis.find(
    (dep) => dep.id === departamentoSelecionado
  );

  if (!departamento) return false;

  const valor = obterDepartamento(item);

  return (
    valor === normalizar(departamento.id) ||
    valor === normalizar(departamento.nome)
  );
}

// Dashboard gerencial: consolida contratos, vendas de exames, consultas e pagamentos,
// mantendo a estrutura visual e os relatórios existentes.
export default function Dashboard({
  usuario,
  onNavigate,
  registros,
  pagamentos: pagamentosExternos = [],
  departamentos = DEPARTAMENTOS_PADRAO,
}) {
  const hoje = new Date();
  const primeiroDiaMes = new Date(
    hoje.getFullYear(),
    hoje.getMonth(),
    1
  );

  const [inicio, setInicio] = useState(dataInput(primeiroDiaMes));
  const [fim, setFim] = useState(dataInput(hoje));
  const [departamento, setDepartamento] = useState("");
  const [responsavel, setResponsavel] = useState("");

  const [registrosFirestore, setRegistrosFirestore] = useState([]);
  const [vendasExamesFirestore, setVendasExamesFirestore] = useState([]);
  const [vendasConsultasFirestore, setVendasConsultasFirestore] = useState([]);
  const [pagamentosFirestore, setPagamentosFirestore] = useState([]);
  const [erroSincronizacao, setErroSincronizacao] = useState("");
  const [fontesCarregadas, setFontesCarregadas] = useState({
    contratos: Array.isArray(registros),
    exames: false,
    consultas: false,
    pagamentos: false,
  });

  useEffect(() => {
    // Contratos continuam vindo do componente pai quando a prop é fornecida.
    if (Array.isArray(registros)) {
      setFontesCarregadas((atual) => ({ ...atual, contratos: true }));
      return undefined;
    }

    const cancelar = onSnapshot(
      collection(db, "contratos"),
      (snapshot) => {
        setRegistrosFirestore(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
        setFontesCarregadas((atual) => ({ ...atual, contratos: true }));
        setErroSincronizacao("");
      },
      (error) => {
        console.error("Erro ao sincronizar contratos do Dashboard:", error);
        setErroSincronizacao(error.code === "permission-denied"
          ? "Sem permissão para consultar os contratos no Dashboard."
          : "Não foi possível sincronizar os contratos.");
        setFontesCarregadas((atual) => ({ ...atual, contratos: true }));
      }
    );

    return () => cancelar();
  }, [registros]);

  useEffect(() => {
    // Vendas de exames são uma coleção independente do fluxo de contratos.
    const cancelar = onSnapshot(
      collection(db, "vendasExames"),
      (snapshot) => {
        setVendasExamesFirestore(
          snapshot.docs.map((item) => ({ id: item.id, ...item.data(), tipoRegistro: "vendaExame" }))
        );
        setFontesCarregadas((atual) => ({ ...atual, exames: true }));
      },
      (error) => {
        console.error("Erro ao sincronizar vendas de exames:", error);
        setErroSincronizacao((atual) => [
          atual,
          error.code === "permission-denied"
            ? "Sem permissão para consultar vendas de exames."
            : "Não foi possível sincronizar vendas de exames."
        ].filter(Boolean).join(" "));
        setFontesCarregadas((atual) => ({ ...atual, exames: true }));
      }
    );

    return () => cancelar();
  }, []);

  useEffect(() => {
    // Vendas de consultas são uma coleção própria, independente de contratos e exames.
    const cancelar = onSnapshot(
      collection(db, "vendasConsultas"),
      (snapshot) => {
        setVendasConsultasFirestore(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
            tipoRegistro: "vendaConsulta",
          }))
        );
        setFontesCarregadas((atual) => ({ ...atual, consultas: true }));
      },
      (error) => {
        console.error("Erro ao sincronizar vendas de consultas:", error);
        setErroSincronizacao((atual) => [
          atual,
          error.code === "permission-denied"
            ? "Sem permissão para consultar vendas de consultas."
            : "Não foi possível sincronizar vendas de consultas.",
        ].filter(Boolean).join(" "));
        setFontesCarregadas((atual) => ({ ...atual, consultas: true }));
      }
    );

    return () => cancelar();
  }, []);

  useEffect(() => {
    // A coleção pagamentos é complementar; se não existir ou não houver acesso,
    // os valores confirmados continuam podendo ser apurados pelos registros-base.
    const cancelar = onSnapshot(
      collection(db, "pagamentos"),
      (snapshot) => {
        setPagamentosFirestore(
          snapshot.docs.map((item) => ({ id: item.id, ...item.data(), tipoRegistro: "pagamento" }))
        );
        setFontesCarregadas((atual) => ({ ...atual, pagamentos: true }));
      },
      (error) => {
        console.warn("Coleção pagamentos indisponível; usando pagamentos dos registros:", error);
        setFontesCarregadas((atual) => ({ ...atual, pagamentos: true }));
      }
    );

    return () => cancelar();
  }, []);

  const registrosAtuais = Array.isArray(registros) ? registros : registrosFirestore;

  // Evita contar novamente uma venda de exames que já esteja espelhada em contratos.
  const vendasExamesSemDuplicidade = useMemo(() => {
    const idsContratos = new Set(
      registrosAtuais
        .filter((item) => item.tipoRegistro !== "pagamento" && item.tipo !== "pagamento")
        .map((item) => String(item.id || item.vendaId || ""))
        .filter(Boolean)
    );

    return vendasExamesFirestore.filter(
      (item) => !idsContratos.has(String(item.id || item.vendaId || ""))
    );
  }, [registrosAtuais, vendasExamesFirestore]);

  const [filtros, setFiltros] = useState({
    inicio: dataInput(primeiroDiaMes),
    fim: dataInput(hoje),
    departamento: "",
    responsavel: "",
  });

  const listaDepartamentos =
    departamentos?.length ? departamentos : DEPARTAMENTOS_PADRAO;

  const contratosBase = useMemo(
    () => registrosAtuais.filter(
      (item) =>
        item.tipoRegistro !== "pagamento" &&
        item.tipo !== "pagamento" &&
        item.tipoRegistro !== "vendaExame" &&
        item.tipoRegistro !== "vendaConsulta"
    ),
    [registrosAtuais]
  );

  const vendasBase = useMemo(() => {
    const exames = vendasExamesSemDuplicidade.map((item) => ({
      ...item,
      tipoRegistro: "vendaExame",
      tipoVenda: item.tipoVenda || "Exames",
      tipoContrato: item.tipoContrato || "Exames",
      origem: item.origem || item.origemCadastro || "Venda de Exames",
      valorContratado: obterValorExames(item),
    }));

    const consultas = vendasConsultasFirestore.map((item) => ({
      ...item,
      tipoRegistro: "vendaConsulta",
      tipoVenda: item.tipoVenda || "Consultas",
      tipoContrato: item.tipoContrato || "Consultas",
      origem: item.origem || item.origemCadastro || "Venda de Consultas",
      valorContratado: Number(
        item.valorContratado ?? item.valorTotal ?? item.valor ?? item.valorFinal ?? 0
      ),
    }));

    return [...contratosBase, ...exames, ...consultas];
  }, [contratosBase, vendasExamesSemDuplicidade, vendasConsultasFirestore]);

  const pagamentosBase = useMemo(() => {
    if (Array.isArray(pagamentosExternos) && pagamentosExternos.length) {
      return pagamentosExternos;
    }
    if (pagamentosFirestore.length) return pagamentosFirestore;

    const pagamentosRegistrados = registrosAtuais.filter(
      (item) =>
        item.tipoRegistro === "pagamento" ||
        item.tipo === "pagamento"
    );
    if (pagamentosRegistrados.length) return pagamentosRegistrados;

    // Fallback: cria uma linha de recebimento apenas para venda com confirmação real.
    return vendasBase.filter(pagamentoConfirmado).map((item) => ({
      ...item,
      status: item.statusPagamentoLabel || item.statusPagamento || "Pago",
      valorRecebido: item.valorRecebido ?? item.valorPago ?? item.valorPagoTotal ?? item.valorTotal ?? 0,
      dataPagamento: item.dataPagamento || item.pagoEm || item.atualizadoEm || item.criadoEm,
      formaPagamento: item.formaPagamento || item.metodoPagamento || item.provedor || item.gateway,
    }));
  }, [registrosAtuais, pagamentosExternos, pagamentosFirestore, vendasBase]);

  const usuariosDisponiveis = useMemo(() => {
    const mapa = new Map();

    vendasBase.forEach((item) => {
      const id = obterResponsavelId(item);
      if (id) mapa.set(id, obterResponsavelNome(item));
    });

    return Array.from(mapa, ([id, nome]) => ({ id, nome }));
  }, [vendasBase]);

  const vendasFiltradasPorPeriodo = useMemo(
    () => vendasBase.filter((item) => {
      // Indicadores comerciais usam a data de criação/realização da venda.
      if (!dentroDoPeriodo(obterData(item), filtros.inicio, filtros.fim)) return false;
      if (filtros.departamento && !pertenceAoDepartamento(item, filtros.departamento, listaDepartamentos)) return false;
      if (filtros.responsavel && obterResponsavelId(item) !== filtros.responsavel) return false;
      return true;
    }),
    [vendasBase, filtros, listaDepartamentos]
  );

  const contratosFiltrados = useMemo(
    () => vendasFiltradasPorPeriodo.filter((item) => !ehVendaCancelada(item)),
    [vendasFiltradasPorPeriodo]
  );

  const vendasCanceladasFiltradas = useMemo(
    () => vendasFiltradasPorPeriodo.filter(ehVendaCancelada),
    [vendasFiltradasPorPeriodo]
  );

  const pagamentosFiltrados = useMemo(
    () => pagamentosBase.filter((item) => {
      // Financeiro usa a data efetiva do pagamento, não a data da venda.
      if (!dentroDoPeriodo(obterDataPagamento(item), filtros.inicio, filtros.fim)) return false;
      if (filtros.departamento && !pertenceAoDepartamento(item, filtros.departamento, listaDepartamentos)) return false;
      if (filtros.responsavel && obterResponsavelId(item) !== filtros.responsavel) return false;
      return true;
    }),
    [pagamentosBase, filtros, listaDepartamentos]
  );

  // Indicadores superiores: vendas e valor total dos contratos filtrados.
  const totalVendas = contratosFiltrados.length;
  const valorVendas = contratosFiltrados.reduce(
    (total, item) => total + obterValorContrato(item),
    0
  );

  // Indicadores operacionais usam os campos separados do fluxo oficial.
  const contarStatus = (campo, valores) => contratosFiltrados.filter((item) =>
    valores.includes(normalizar(item[campo] || item[`${campo}Label`]))
  ).length;
  const totalEmCadastramento = contratosFiltrados.filter((item) =>
    normalizar(item.statusVendaLabel || item.statusVenda || item.statusLabel || item.status) === "em cadastramento"
  ).length;
  const totalEmAnalise = contratosFiltrados.filter((item) =>
    ["em analise", "analise de credito"].includes(normalizar(item.statusVendaLabel || item.statusVenda || item.statusLabel || item.status))
  ).length;
  const totalAtivos = contratosFiltrados.filter((item) =>
    normalizar(item.statusVendaLabel || item.statusVenda || item.statusLabel || item.status) === "ativo"
  ).length;
  const totalPendentesPagamento = contratosFiltrados.filter((item) =>
    !pagamentoConfirmado(item) &&
    ["aguardando pagamento", "pendente", "nao iniciado", "em processamento", "waiting_payment", "pending", "aguardando"]
      .includes(obterStatusPagamento(item))
  ).length;

  const valorTotalRecebido = pagamentosFiltrados
    .filter(pagamentoConfirmado)
    .reduce((total, item) => total + obterValorPagamento(item), 0);

  // Saldo pendente calculado por venda quando há pagamentos vinculados.
  // Se não houver vínculo financeiro, usa-se o status da própria venda.
  const valorTotalPendente = contratosFiltrados.reduce((total, venda) => {
    const valorVenda = obterValorContrato(venda);
    const idVenda = String(venda.id || venda.vendaId || venda.contratoId || "");
    const pagamentosVinculados = pagamentosBase.filter((pagamento) =>
      String(pagamento.vendaId || pagamento.contratoId || pagamento.idVenda || "") === idVenda &&
      pagamentoConfirmado(pagamento)
    );
    const recebidoVinculado = pagamentosVinculados.reduce(
      (soma, pagamento) => soma + obterValorPagamento(pagamento), 0
    );

    if (pagamentosVinculados.length) {
      return total + Math.max(0, valorVenda - recebidoVinculado);
    }
    return total + (pagamentoConfirmado(venda) ? 0 : valorVenda);
  }, 0);

  const vendasPlanosFiltradas = contratosFiltrados.filter(
    (item) => item.tipoRegistro !== "vendaExame" && item.tipoRegistro !== "vendaConsulta"
  );

  const vendasExamesFiltradas = contratosFiltrados.filter(
    (item) => item.tipoRegistro === "vendaExame"
  );

  const vendasConsultasFiltradas = contratosFiltrados.filter(
    (item) => item.tipoRegistro === "vendaConsulta"
  );

  const quantidadeVendasPlanos = vendasPlanosFiltradas.length;
  const valorVendasPlanos = vendasPlanosFiltradas.reduce(
    (total, item) => total + obterValorContrato(item), 0
  );

  const quantidadeVendasExames = vendasExamesFiltradas.length;
  const valorVendasExames = vendasExamesFiltradas.reduce(
    (total, item) => total + obterValorContrato(item), 0
  );

  const quantidadeItensExames = vendasExamesFiltradas.reduce(
    (total, item) => total + obterQuantidadeItensExame(item), 0
  );

  const quantidadeVendasConsultas = vendasConsultasFiltradas.length;
  const valorVendasConsultas = vendasConsultasFiltradas.reduce(
    (total, item) => total + obterValorContrato(item), 0
  );

  const quantidadeVendasCanceladas = vendasCanceladasFiltradas.length;
  const valorVendasCanceladas = vendasCanceladasFiltradas.reduce(
    (total, item) => total + obterValorContrato(item), 0
  );

  const relatorioItensExames = vendasExamesFiltradas.flatMap((venda) =>
    obterItensExame(venda).map((exame) => ({
      ...exame,
      vendaId: venda.id || venda.vendaId || "",
      cliente: venda.clienteNome || venda.nomeCliente || "Não informado",
      vendedor: obterResponsavelNome(venda),
      data: exame.dataExame || obterData(venda),
      statusPagamento: pagamentoConfirmado(venda)
        ? "Pago"
        : (venda.statusPagamento || "Pendente"),
    }))
  );
  const totalPagos = contratosFiltrados.filter(pagamentoConfirmado).length;
  const totalSemContratoAssinado = contratosFiltrados.filter((item) =>
    normalizar(item.pendenciaCadastroLabel || item.pendenciaCadastro) === "nao tem contrato assinado"
  ).length;

  // Gráficos de pagamentos: quantidade de transações e valor efetivamente recebido.
  const quantidadePorPagamento = FORMAS_PAGAMENTO.map((nome, index) => ({
    nome,
    quantidade: pagamentosFiltrados.filter(
      (item) => obterFormaPagamento(item) === normalizar(nome)
    ).length,
    cor: CORES[index % CORES.length],
  }));

  const valorPorPagamento = FORMAS_PAGAMENTO.map((nome, index) => ({
    nome,
    valor: pagamentosFiltrados
      .filter((item) => obterFormaPagamento(item) === normalizar(nome))
      .filter(pagamentoConfirmado)
      .reduce((total, item) => total + obterValorPagamento(item), 0),
    cor: CORES[index % CORES.length],
  }));

  // Gráficos de origem: quantidade de contratos e valor contratado.
  const origensRelatorio = Array.from(new Set([
    ...ORIGENS,
    ...contratosFiltrados.map((item) => obterOrigem(item)).filter(Boolean),
  ]));

  const quantidadePorOrigem = origensRelatorio.map((nome, index) => ({
    nome,
    quantidade: contratosFiltrados.filter(
      (item) => normalizar(obterOrigem(item)) === normalizar(nome)
    ).length,
    cor: CORES[index % CORES.length],
  }));

  const valorPorOrigem = origensRelatorio.map((nome, index) => ({
    nome,
    valor: contratosFiltrados
      .filter((item) => normalizar(obterOrigem(item)) === normalizar(nome))
      .reduce((total, item) => total + obterValorContrato(item), 0),
    cor: CORES[index % CORES.length],
  }));

  // Gráficos por tipo de venda.
  const tiposRelatorio = Array.from(new Set([
    ...TIPOS,
    ...contratosFiltrados.map((item) => obterTipo(item)).filter(Boolean),
  ]));

  const quantidadePorTipo = tiposRelatorio.map((nome, index) => ({
    nome,
    quantidade: contratosFiltrados.filter(
      (item) => normalizar(obterTipo(item)) === normalizar(nome)
    ).length,
    cor: CORES[index % CORES.length],
  }));

  const valorPorTipo = tiposRelatorio.map((nome, index) => ({
    nome,
    valor: contratosFiltrados
      .filter((item) => normalizar(obterTipo(item)) === normalizar(nome))
      .reduce((total, item) => total + obterValorContrato(item), 0),
    cor: CORES[index % CORES.length],
  }));

  const totalQuantidadePagamento = quantidadePorPagamento.reduce(
    (soma, item) => soma + item.quantidade, 0
  );

  const totalValorPagamento = valorPorPagamento.reduce(
    (soma, item) => soma + item.valor, 0
  );

  const totalQuantidadeOrigem = quantidadePorOrigem.reduce(
    (soma, item) => soma + item.quantidade, 0
  );

  const totalValorOrigem = valorPorOrigem.reduce(
    (soma, item) => soma + item.valor, 0
  );

  const totalQuantidadeTipo = quantidadePorTipo.reduce(
    (soma, item) => soma + item.quantidade, 0
  );

  const totalValorTipo = valorPorTipo.reduce(
    (soma, item) => soma + item.valor, 0
  );

  function aplicarFiltros() {
    if (inicio > fim) {
      alert("A Data Início não pode ser maior que a Data Fim.");
      return;
    }

    setFiltros({
      inicio,
      fim,
      departamento,
      responsavel,
    });
  }

  function exportar() {
    const linhas = [
      ["Grupo", "Categoria", "Quantidade", "Valor"],
      ...quantidadePorPagamento.map((item) => [
        "Forma de pagamento",
        item.nome,
        item.quantidade,
        valorPorPagamento.find((x) => x.nome === item.nome)?.valor || 0,
      ]),
      ...quantidadePorOrigem.map((item) => [
        "Origem",
        item.nome,
        item.quantidade,
        valorPorOrigem.find((x) => x.nome === item.nome)?.valor || 0,
      ]),
      ...quantidadePorTipo.map((item) => [
        "Tipo",
        item.nome,
        item.quantidade,
        valorPorTipo.find((x) => x.nome === item.nome)?.valor || 0,
      ]),
      ["Indicador", "Vendas de planos", quantidadeVendasPlanos, valorVendasPlanos],
      ["Indicador", "Vendas de exames", quantidadeVendasExames, valorVendasExames],
      ["Indicador", "Vendas de consultas", quantidadeVendasConsultas, valorVendasConsultas],
      ["Indicador", "Vendas canceladas", quantidadeVendasCanceladas, valorVendasCanceladas],
      ["Indicador", "Itens de exames", quantidadeItensExames, 0],
      ["Indicador", "Valor recebido confirmado", "", valorTotalRecebido],
      ["Indicador", "Valor pendente", "", valorTotalPendente],
      [],
      ["DETALHAMENTO DE VENDAS"],
      ["ID", "Tipo", "Cliente", "CPF", "Responsável", "Departamento", "Origem", "Data", "Status da venda", "Status pagamento", "Forma pagamento", "Valor"],
      ...contratosFiltrados.map((item) => [
        item.id || item.vendaId || "",
        item.tipoRegistro === "vendaExame"
          ? "Exames"
          : item.tipoRegistro === "vendaConsulta"
            ? "Consultas"
            : "Carteirinha / Plano",
        item.clienteNome || item.nomeCliente || item.nome || "",
        item.clienteCPF || item.cpf || "",
        obterResponsavelNome(item),
        item.departamentoNome || item.nomeDepartamento || item.departamento || "",
        obterOrigem(item),
        obterData(item)?.toLocaleDateString("pt-BR") || "",
        item.statusVenda || item.status || "",
        item.statusPagamento || "",
        item.formaPagamento || item.metodoPagamento || item.provedor || "",
        obterValorContrato(item),
      ]),
      [],
      ["DETALHAMENTO DE VENDAS CANCELADAS"],
      ["ID", "Tipo", "Cliente", "Responsável", "Data", "Status", "Valor"],
      ...vendasCanceladasFiltradas.map((item) => [
        item.id || item.vendaId || "",
        item.tipoRegistro === "vendaExame" ? "Exames" : item.tipoRegistro === "vendaConsulta" ? "Consultas" : "Carteirinha / Plano",
        item.clienteNome || item.nomeCliente || item.nome || "",
        obterResponsavelNome(item),
        obterData(item)?.toLocaleDateString("pt-BR") || "",
        item.statusVenda || item.status || "Cancelada",
        obterValorContrato(item),
      ]),
      [],
      ["DETALHAMENTO DE PAGAMENTOS"],
      ["ID", "Venda/Contrato", "Cliente", "Data pagamento", "Forma", "Status", "Valor recebido"],
      ...pagamentosFiltrados.map((item) => [
        item.id || "",
        obterIdVenda(item),
        item.clienteNome || item.nomeCliente || "",
        obterDataPagamento(item)?.toLocaleDateString("pt-BR") || "",
        obterFormaPagamento(item),
        item.statusPagamento || item.status || "",
        pagamentoConfirmado(item) ? obterValorPagamento(item) : 0,
      ]),
      [],
      ["DETALHAMENTO DOS EXAMES"],
      ["Venda", "Cliente", "Exame", "Clínica", "Cidade", "Quantidade", "Valor", "Responsável", "Data do exame/venda", "Pagamento"],
      ...relatorioItensExames.map((item) => [
        item.vendaId, item.cliente, item.nome, item.clinica, item.cidade,
        item.quantidade, item.valor, item.vendedor,
        item.data?.toLocaleDateString("pt-BR") || "", item.statusPagamento,
      ]),
    ];

    const csv = linhas
      .map((linha) =>
        linha.map((valor) =>
          `"${String(valor).replaceAll('"', '""')}"`
        ).join(";")
      )
      .join("\n");

    const arquivo = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(arquivo);
    const link = document.createElement("a");
    link.href = url;
    link.download = "dashboard-gestao-doutor-saude-familiar.csv";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function GraficoQuantidade({ titulo, dados, total }) {
    return (
      <section className="dashboard-grafico-card">
        <h3>{titulo}</h3>
        <div className="dashboard-grafico-area">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dados} margin={{ top: 8, right: 8, left: 0, bottom: 40 }}>
              <CartesianGrid stroke="#e9e9e9" />
              <XAxis
                dataKey="nome"
                interval={0}
                angle={-15}
                textAnchor="end"
                height={52}
                tick={{ fontSize: 9, fill: "#555" }}
              />
              <YAxis allowDecimals={false} tick={{ fontSize: 9, fill: "#666" }} />
              <Tooltip
                formatter={(valor) => [numero(valor), "Quantidade"]}
                labelStyle={{ fontSize: 11 }}
              />
              <Bar dataKey="quantidade" maxBarSize={55} isAnimationActive={false}>
                {dados.map((item) => (
                  <Cell key={item.nome} fill={item.cor} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="dashboard-total-grafico">
          Total quantidade: {numero(total)}
        </div>
      </section>
    );
  }

  function GraficoValor({ titulo, dados, total }) {
    return (
      <section className="dashboard-grafico-card">
        <h3>{titulo}</h3>
        <div className="dashboard-grafico-area">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dados} margin={{ top: 8, right: 8, left: 8, bottom: 40 }}>
              <CartesianGrid stroke="#e9e9e9" />
              <XAxis
                dataKey="nome"
                interval={0}
                angle={-15}
                textAnchor="end"
                height={52}
                tick={{ fontSize: 9, fill: "#555" }}
              />
              <YAxis
                tick={{ fontSize: 9, fill: "#666" }}
                tickFormatter={(valor) =>
                  valor >= 1000
                    ? `${(valor / 1000).toLocaleString("pt-BR")} mil`
                    : numero(valor)
                }
              />
              <Tooltip
                formatter={(valor) => [moeda(valor), "Valor"]}
                labelStyle={{ fontSize: 11 }}
              />
              <Bar dataKey="valor" maxBarSize={55} isAnimationActive={false}>
                {dados.map((item) => (
                  <Cell key={item.nome} fill={item.cor} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="dashboard-total-grafico">
          Total valor (R$): {moeda(total)}
        </div>
      </section>
    );
  }

  const nomeUsuario =
    usuario?.displayName ||
    usuario?.email?.split("@")[0] ||
    "Usuário";

  return (
    <main className="dashboard">

      {/* SAUDAÇÃO */}

      <header
        className="dashboard-boas-vindas"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 14,
        }}
      >
        <span>Bem-vindo {nomeUsuario}!</span>
        <button
          type="button"
          onClick={() => {
            if (typeof onNavigate === "function") onNavigate("/relatorios");
            else window.location.href = "/relatorios";
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 9,
            padding: "10px 16px",
            border: "1px solid rgba(255,255,255,.28)",
            borderRadius: 9,
            background: "#174ea6",
            color: "#fff",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          <FileBarChart2 size={17} />
          Acessar Relatórios
        </button>
      </header>

      {erroSincronizacao && (
        <div className="dashboard-alerta" role="alert">{erroSincronizacao}</div>
      )}

      {!fontesCarregadas.contratos || !fontesCarregadas.exames || !fontesCarregadas.consultas ? (
        <div className="dashboard-alerta" role="status">
          Sincronizando contratos, vendas de exames e consultas...
        </div>
      ) : null}


      {/* INDICADORES DE VENDAS, CADASTRO E PAGAMENTO */}

      <section className="dashboard-indicadores">

        <article className="dashboard-indicador">
          <h3>Resumo de vendas</h3>
          <div className="dashboard-indicador-dados">
            <div>
              <strong>{numero(totalVendas)}</strong>
              <span>Quantidade de vendas</span>
            </div>
            <div>
              <strong>{moeda(valorVendas)}</strong>
              <span>Valor de vendas</span>
            </div>
          </div>
        </article>

        <article className="dashboard-indicador">
          <h3>Vendas por origem</h3>
          <div className="dashboard-indicador-dados">
            <div>
              <strong>{numero(totalVendas)}</strong>
              <span>Quantidade de vendas</span>
            </div>
            <div>
              <strong>{moeda(valorVendas)}</strong>
              <span>Valor de vendas</span>
            </div>
          </div>
        </article>

        <article className="dashboard-indicador">
          <h3>Vendas por valor</h3>
          <div className="dashboard-indicador-dados">
            <div>
              <strong>{numero(totalVendas)}</strong>
              <span>Quantidade de vendas</span>
            </div>
            <div>
              <strong>{moeda(valorVendas)}</strong>
              <span>Valor de vendas</span>
            </div>
          </div>
        </article>

        <article className="dashboard-indicador">
          <h3>Etapas da venda</h3>
          <div className="dashboard-indicador-dados">
            <div><strong>{numero(totalEmCadastramento)}</strong><span>Em Cadastramento</span></div>
            <div><strong>{numero(totalEmAnalise)}</strong><span>Em Análise</span></div>
            <div><strong>{numero(totalAtivos)}</strong><span>Ativos</span></div>
          </div>
        </article>

        <article className="dashboard-indicador">
          <h3>Situação financeira</h3>
          <div className="dashboard-indicador-dados">
            <div><strong>{numero(totalPagos)}</strong><span>Pagamentos confirmados</span></div>
            <div><strong>{numero(totalPendentesPagamento)}</strong><span>Aguardando / não iniciado</span></div>
            <div><strong>{numero(totalSemContratoAssinado)}</strong><span>Sem contrato assinado</span></div>
          </div>
        </article>

      </section>

      {/* FILTROS NA MESMA LINHA DA REFERÊNCIA */}

      <section className="dashboard-filtros">
        <label>
          <span>Departamento</span>
          <select
            value={departamento}
            onChange={(e) => setDepartamento(e.target.value)}
          >
            <option value="">Todos</option>
            {listaDepartamentos.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Usuário</span>
          <select
            value={responsavel}
            onChange={(e) => setResponsavel(e.target.value)}
          >
            <option value="">Selecione uma opção</option>
            {usuariosDisponiveis.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nome}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Data inicial da venda</span>
          <input
            type="date"
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
          />
        </label>

        <label>
          <span>Data final da venda</span>
          <input
            type="date"
            value={fim}
            onChange={(e) => setFim(e.target.value)}
          />
        </label>

        <div className="dashboard-filtro-acoes">
          <button
            type="button"
            className="dashboard-filtrar"
            onClick={aplicarFiltros}
          >
            <Filter size={15} style={{ marginRight: 6 }} />
            Filtrar
          </button>

          <button
            type="button"
            className="dashboard-exportar"
            onClick={exportar}
          >
            <Download size={15} style={{ marginRight: 6 }} />
            Exportar
          </button>
        </div>
      </section>

      {/* 1º — PAGAMENTOS */}

      <section className="dashboard-secao">
        <div className="dashboard-graficos-grid">
          <GraficoQuantidade
            titulo="Quantidade por forma de pagamento"
            dados={quantidadePorPagamento}
            total={totalQuantidadePagamento}
          />
          <GraficoValor
            titulo="Valor por forma de pagamento"
            dados={valorPorPagamento}
            total={totalValorPagamento}
          />
        </div>
      </section>

      {/* 2º — ORIGEM */}

      <section className="dashboard-secao">
        <div className="dashboard-graficos-grid">
          <GraficoQuantidade
            titulo="Quantidade por origem"
            dados={quantidadePorOrigem}
            total={totalQuantidadeOrigem}
          />
          <GraficoValor
            titulo="Valor por origem"
            dados={valorPorOrigem}
            total={totalValorOrigem}
          />
        </div>
      </section>

      {/* 3º — TIPO */}

      <section className="dashboard-secao">
        <div className="dashboard-graficos-grid">
          <GraficoQuantidade
            titulo="Quantidade por tipo"
            dados={quantidadePorTipo}
            total={totalQuantidadeTipo}
          />
          <GraficoValor
            titulo="Valor por tipo"
            dados={valorPorTipo}
            total={totalValorTipo}
          />
        </div>
      </section>

      {/* 4º — RESUMO FINANCEIRO E SEPARAÇÃO DE PRODUTOS */}
      <section className="dashboard-secao">
        <div className="dashboard-indicadores">
          <article className="dashboard-indicador">
            <h3>Vendas de planos</h3>
            <div className="dashboard-indicador-dados">
              <div><strong>{numero(quantidadeVendasPlanos)}</strong><span>Contratos</span></div>
              <div><strong>{moeda(valorVendasPlanos)}</strong><span>Valor contratado</span></div>
            </div>
          </article>
          <article className="dashboard-indicador">
            <h3>Vendas de exames</h3>
            <div className="dashboard-indicador-dados">
              <div><strong>{numero(quantidadeVendasExames)}</strong><span>Vendas</span></div>
              <div><strong>{moeda(valorVendasExames)}</strong><span>Valor vendido</span></div>
              <div><strong>{numero(quantidadeItensExames)}</strong><span>Exames vendidos</span></div>
            </div>
          </article>
          <article className="dashboard-indicador">
            <h3>Vendas de consultas</h3>
            <div className="dashboard-indicador-dados">
              <div><strong>{numero(quantidadeVendasConsultas)}</strong><span>Vendas</span></div>
              <div><strong>{moeda(valorVendasConsultas)}</strong><span>Valor vendido</span></div>
            </div>
          </article>
          <article className="dashboard-indicador">
            <h3>Vendas canceladas</h3>
            <div className="dashboard-indicador-dados">
              <div><strong>{numero(quantidadeVendasCanceladas)}</strong><span>Cancelamentos</span></div>
              <div><strong>{moeda(valorVendasCanceladas)}</strong><span>Valor cancelado</span></div>
            </div>
          </article>
          <article className="dashboard-indicador">
            <h3>Financeiro consolidado</h3>
            <div className="dashboard-indicador-dados">
              <div><strong>{moeda(valorTotalRecebido)}</strong><span>Recebido confirmado</span></div>
              <div><strong>{moeda(valorTotalPendente)}</strong><span>Valor pendente</span></div>
            </div>
          </article>
        </div>
      </section>

      {/* 5º — DETALHAMENTO DOS EXAMES VENDIDOS */}
      <section className="dashboard-secao">
        <div className="dashboard-grafico-card">
          <h3>Exames vendidos no período</h3>
          <div className="dashboard-tabela-wrapper">
            <table className="dashboard-tabela">
              <thead>
                <tr>
                  <th>Data do exame/venda</th>
                  <th>Exame</th>
                  <th>Clínica</th>
                  <th>Quantidade</th>
                  <th>Valor</th>
                  <th>Cliente</th>
                  <th>Responsável</th>
                  <th>Pagamento</th>
                </tr>
              </thead>
              <tbody>
                {relatorioItensExames.length ? relatorioItensExames.map((item, index) => (
                  <tr key={`${item.vendaId}-${item.nome}-${index}`}>
                    <td>{item.data?.toLocaleDateString("pt-BR") || "—"}</td>
                    <td>{item.nome}</td>
                    <td>
                      {item.clinica}
                      {item.cidade ? ` — ${item.cidade}` : ""}
                    </td>
                    <td>{numero(item.quantidade)}</td>
                    <td>{moeda(item.valor)}</td>
                    <td>{item.cliente}</td>
                    <td>{item.vendedor}</td>
                    <td>{item.statusPagamento}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={8}>Nenhum exame vendido no período selecionado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 6º — DETALHAMENTO DAS VENDAS E RECEBIMENTOS */}
      <section className="dashboard-secao">
        <div className="dashboard-grafico-card">
          <h3>Conferência das vendas filtradas</h3>
          <div className="dashboard-tabela-wrapper">
            <table className="dashboard-tabela">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Tipo</th>
                  <th>Cliente</th>
                  <th>Responsável</th>
                  <th>Status</th>
                  <th>Pagamento</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {contratosFiltrados.length ? contratosFiltrados.map((item) => (
                  <tr key={`${item.tipoRegistro || "contrato"}-${item.id || item.vendaId}`}>
                    <td>{obterData(item)?.toLocaleDateString("pt-BR") || "—"}</td>
                    <td>
                      {item.tipoRegistro === "vendaExame"
                        ? "Exames"
                        : item.tipoRegistro === "vendaConsulta"
                          ? "Consultas"
                          : "Carteirinha / Plano"}
                    </td>
                    <td>{item.clienteNome || item.nomeCliente || item.nome || "Não informado"}</td>
                    <td>{obterResponsavelNome(item)}</td>
                    <td>{item.statusVenda || item.status || "—"}</td>
                    <td>{pagamentoConfirmado(item) ? "Pago" : (item.statusPagamento || "Pendente")}</td>
                    <td>{moeda(obterValorContrato(item))}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={7}>Nenhuma venda encontrada para os filtros selecionados.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

    </main>
  );
}