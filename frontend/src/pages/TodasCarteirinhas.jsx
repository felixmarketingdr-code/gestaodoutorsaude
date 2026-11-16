
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";

import {
  Search,
  RefreshCw,
  Eye,
  Pencil,
  ChevronDown,
  ChevronUp,
  Filter,
  X,
  FileText,
  User,
  Users,
  Bell,
  History,
  CalendarDays,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

import { db } from "../config/firebase";
import "./TodasVendas.css";

// ===================================================
// FUNÇÕES AUXILIARES
// ===================================================

function numeros(valor) {
  return String(valor || "").replace(/\D/g, "");
}

function formatarCPF(valor) {
  const cpf = numeros(valor).slice(0, 11);

  return cpf
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function dataValor(valor) {
  if (!valor) return 0;

  if (typeof valor?.toDate === "function") {
    return valor.toDate().getTime();
  }

  const data = new Date(valor);

  return Number.isNaN(data.getTime()) ? 0 : data.getTime();
}

function dataLegivel(valor) {
  if (!valor) return "—";

  const data =
    typeof valor?.toDate === "function"
      ? valor.toDate()
      : new Date(valor);

  return Number.isNaN(data.getTime())
    ? "—"
    : data.toLocaleDateString("pt-BR");
}

function dinheiro(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function normalizar(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// ===================================================
// STATUS DA VENDA
// ===================================================

function identificarStatus(contrato) {
  // Status da venda: nunca inferir a partir da pendência ou do pagamento.
  const textoStatus =
    contrato?.statusVendaLabel ||
    contrato?.statusVenda ||
    contrato?.statusLabel ||
    contrato?.status ||
    "Não informado";

  const status = normalizar(textoStatus);

  if (status === "ativo") {
    return { texto: "Ativo", classe: "tv-status-ativo" };
  }
  if (status === "pendente") {
    return { texto: "Pendente", classe: "tv-status-pendente" };
  }
  if (status === "em analise" || status === "em análise") {
    return { texto: "Em análise", classe: "tv-status-analise" };
  }
  if (status === "cancelado" || status === "cancelada") {
    return { texto: "Cancelado", classe: "tv-status-cancelado" };
  }
  if (status === "inativo" || status === "inativa") {
    return { texto: "Inativo", classe: "tv-status-neutro" };
  }

  return { texto: textoStatus, classe: "tv-status-neutro" };
}

// ===================================================
// PENDÊNCIA DO CADASTRO
// ===================================================

function identificarPendencia(contrato) {
  const valor =
    contrato.pendenciaCadastroLabel ||
    contrato.pendenciaCadastro ||
    contrato.pendenciaCliente ||
    contrato.pendencia ||
    contrato.tipoPendencia ||
    contrato.motivoPendencia ||
    "";

  if (!valor) {
    return {
      texto: "Não informada",
      classe: "tv-pendencia-neutra",
    };
  }

  const texto = String(valor);

  const normalizado = normalizar(texto);

  if (
    normalizado.includes("sem pend") ||
    normalizado === "nenhuma" ||
    normalizado === "nao"
  ) {
    return {
      texto,
      classe: "tv-pendencia-ok",
    };
  }

  return {
    texto,
    classe: "tv-pendencia-alerta",
  };
}

// ===================================================
// REGRA DE ENTRADA EM TODAS AS CARTEIRINHAS
// Somente contratos efetivamente regularizados aparecem nesta página.
// A aprovação da auditoria deve deixar o contrato ativo e sem pendência.
// A confirmação do pagamento deve vir do backend/webhook, nunca da geração
// de QR Code, boleto ou link.
// ===================================================

function pagamentoEstaConfirmado(contrato) {
  const valor = normalizar(
    contrato?.statusPagamentoLabel ||
    contrato?.statusPagamento ||
    contrato?.pagamentoStatus ||
    contrato?.statusCobranca ||
    contrato?.cliente?.statusPagamentoLabel ||
    contrato?.cliente?.statusPagamento ||
    ""
  );

  return ["pago", "paga", "aprovado", "aprovada", "confirmado", "confirmada", "paid", "succeeded", "captured", "capturado", "recebido", "concluido", "concluida"].some((item) => valor === item || valor.includes(item));
}

function eventoIndicaEnel(evento) {
  const texto = [
    evento?.tipo,
    evento?.descricao,
    evento?.titulo,
    evento?.origem,
    evento?.canalVenda,
    evento?.formaPagamento,
    evento?.metodoPagamento,
    evento?.observacao,
    evento?.mensagem,
  ]
    .filter(Boolean)
    .join(" ");

  return normalizar(texto).includes("enel");
}

function eventoIndicaAtivacaoAdministrativa(evento) {
  const tipo = normalizar(evento?.tipo || "");
  const descricao = normalizar(evento?.descricao || "");
  const statusNovo = normalizar(
    evento?.statusNovo ||
    evento?.statusVendaNovo ||
    evento?.statusVenda ||
    evento?.novoStatus ||
    ""
  );

  return (
    statusNovo === "ativo" ||
    (
      (
        tipo.includes("alteracao_status_venda") ||
        tipo.includes("alteracao status venda") ||
        tipo.includes("status_venda")
      ) &&
      (
        descricao.includes('para "ativo"') ||
        descricao.includes("para ativo") ||
        descricao.includes("alterado para ativo")
      )
    )
  );
}

function identificarOrigemEnel(contrato) {
  const camposOrigem = [
    contrato?.formaPagamento,
    contrato?.metodoPagamento,
    contrato?.origemPagamento,
    contrato?.origemVenda,
    contrato?.canalVenda,
    contrato?.indicador,
    contrato?.observacoesVendedor,
    contrato?.cliente?.formaPagamento,
    contrato?.cliente?.origemVenda,
  ];

  const origemNoCadastro = normalizar(
    camposOrigem.filter(Boolean).join(" ")
  ).includes("enel");

  const historico = Array.isArray(contrato?.historicoCarteirinha)
    ? contrato.historicoCarteirinha
    : [];

  const origemNoHistorico = historico.some(eventoIndicaEnel);
  const ativacaoAdministrativa = historico.some(
    eventoIndicaAtivacaoAdministrativa
  );

  return {
    ehEnel: origemNoCadastro || origemNoHistorico,
    ativacaoAdministrativa,
  };
}

function contratoSemPendencia(contrato, ehEnel = false) {
  const pendencia = identificarPendencia(contrato);
  const texto = normalizar(pendencia.texto);

  const pendenciaRegularizada =
    !texto ||
    texto === "nao informada" ||
    texto === "nenhuma" ||
    texto === "nao" ||
    texto.includes("sem pendencia") ||
    texto === "regularizado" ||
    texto === "regularizada";

  // Nas vendas ENEL, o histórico pode registrar a pendência como "PAGO"
  // depois da regularização administrativa. Não tratar esse registro como
  // uma pendência aberta.
  const statusEnelRegularizado =
    ehEnel &&
    [
      "pago",
      "venda auditada enel",
      "carteirinha enviada",
    ].includes(texto);

  return pendenciaRegularizada || statusEnelRegularizado;
}

function ehCarteirinhaRegularizada(contrato) {
  const status = identificarStatus(contrato);
  const origem = identificarOrigemEnel(contrato);

  if (status.classe !== "tv-status-ativo") {
    return false;
  }

  const semPendencia = contratoSemPendencia(
    contrato,
    origem.ehEnel
  );

  const liberadaPeloPagarme =
    pagamentoEstaConfirmado(contrato) && semPendencia;

  const liberadaPelaEnel =
    origem.ehEnel &&
    origem.ativacaoAdministrativa &&
    semPendencia;

  return liberadaPeloPagarme || liberadaPelaEnel;
}

// ===================================================
// COMPONENTE PRINCIPAL
// ===================================================

export default function TodasCarteirinhas({ usuario, onNavigate }) {
  const [vendas, setVendas] = useState([]);
  const [clientes, setClientes] = useState([]);

  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);

  const [erro, setErro] = useState("");

  const [filtrosAbertos, setFiltrosAbertos] = useState(true);

  const [busca, setBusca] = useState("");
  const [filtros, setFiltros] = useState({
    limite: "50",
    contrato: "",
    titular: "",
    cpf: "",
    dependente: "",
    celular: "",
    cep: "",
    plano: "",
    formaPagamento: "",
    statusPagamento: "",
    periodicidade: "",
    canalVenda: "",
    pendencia: "",
    vendedor: "",
    status: "",
    indicador: "",
    dataVendaInicial: "",
    dataVendaFinal: "",
    dataAtivacaoInicial: "",
    dataAtivacaoFinal: "",
    ativoInativo: "todos",
  });

  const [modalAberto, setModalAberto] = useState(false);
  const [contratoSelecionado, setContratoSelecionado] =
    useState(null);
  const [clienteSelecionado, setClienteSelecionado] =
    useState(null);

  const [abaModal, setAbaModal] = useState("dados");

  const [dependentes, setDependentes] = useState([]);
  const [notificacoes, setNotificacoes] = useState([]);
  const [historico, setHistorico] = useState([]);
  const [erroHistorico, setErroHistorico] = useState("");
  const [agendamentos, setAgendamentos] = useState([]);

  const [carregandoModal, setCarregandoModal] =
    useState(false);

  // ===================================================
  // CARREGAR VENDAS
  // ===================================================

  const carregarVendas = useCallback(
    async (silencioso = false) => {
      if (!usuario?.uid) {
        setVendas([]);
        setClientes([]);
        setCarregando(false);
        setErro("Usuário não identificado.");
        return;
      }

      if (silencioso) {
        setAtualizando(true);
      } else {
        setCarregando(true);
      }

      setErro("");

      try {
        let claims = usuario.customClaims || {};

        if (typeof usuario.getIdTokenResult === "function") {
          const token = await usuario.getIdTokenResult(true);
          claims = token?.claims || claims;
        }

        const perfil = normalizar(
          usuario.role ||
          usuario.perfil ||
          usuario.tipoUsuario ||
          claims.role ||
          claims.perfil
        );

        const ehAdmin =
          ["admin", "administrador", "administracao"].includes(perfil) ||
          claims.admin === true ||
          claims.administrador === true;

        const contratosRef = collection(db, "contratos");

        let contratosSnap;

        if (ehAdmin) {
          contratosSnap = await getDocs(contratosRef);
        } else {
          contratosSnap = await getDocs(
            query(
              contratosRef,
              where("vendedorId", "==", usuario.uid)
            )
          );
        }

        const listaContratos = contratosSnap.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));

        const idsClientes = [
          ...new Set(
            listaContratos
              .map((item) => item.clienteId)
              .filter(Boolean)
          ),
        ];

        const documentosClientes = await Promise.all(
          idsClientes.map((id) =>
            getDoc(doc(db, "clientes", id))
          )
        );

        const listaClientes = documentosClientes
          .filter((item) => item.exists())
          .map((item) => ({
            id: item.id,
            ...item.data(),
          }));

        const mapaClientes = new Map(
          listaClientes.map((cliente) => [
            cliente.id,
            cliente,
          ])
        );

        // Carrega o histórico que comprova a origem ENEL e a ativação
        // administrativa. A consulta é independente por contrato para que
        // uma falha de histórico não esconda vendas Pagar.me já pagas.
        const historicosPorContrato = new Map();

        await Promise.all(
          listaContratos.map(async (contrato) => {
            const clienteId = contrato.clienteId;

            const resultados = await Promise.allSettled([
              getDocs(
                collection(db, "contratos", contrato.id, "historico")
              ),
              clienteId
                ? getDocs(collection(db, "clientes", clienteId, "historico"))
                : Promise.resolve({ docs: [] }),
              getDocs(
                collection(
                  db,
                  "historicoContratos",
                  contrato.id,
                  "eventos"
                )
              ),
            ]);

            const eventos = [];

            resultados.forEach((resultado, indice) => {
              if (resultado.status !== "fulfilled") {
                console.warn(
                  `Não foi possível carregar o histórico ${indice + 1} do contrato ${contrato.id}:`,
                  resultado.reason
                );
                return;
              }

              (resultado.value?.docs || []).forEach((item) => {
                eventos.push({
                  id: item.id,
                  ...item.data(),
                });
              });
            });

            historicosPorContrato.set(contrato.id, eventos);
          })
        );

        const contratosPorCliente = new Map();

        listaContratos.forEach((contrato) => {
          if (!contrato.clienteId) return;

          const lista = contratosPorCliente.get(contrato.clienteId) || [];
          lista.push(contrato.id);
          contratosPorCliente.set(contrato.clienteId, lista);
        });

        const vendasComClientes = listaContratos.map((contrato) => {
          const contratosDoCliente = contrato.clienteId
            ? contratosPorCliente.get(contrato.clienteId) || []
            : [];
          const clienteEncontrado = mapaClientes.get(contrato.clienteId);

          return {
            ...contrato,
            historicoCarteirinha:
              historicosPorContrato.get(contrato.id) || [],
            origemVendaLabel: identificarOrigemEnel({
              ...contrato,
              cliente: clienteEncontrado || {},
              historicoCarteirinha:
                historicosPorContrato.get(contrato.id) || [],
            }).ehEnel ? "ENEL" : (contrato.origemVenda || contrato.canalVenda || ""),
            // O contrato é a fonte principal. O cliente serve como fallback
            // para cadastros antigos que ainda não possuem os campos novos.
            statusVendaLabel:
              contrato.statusVendaLabel ||
              contrato.statusVenda ||
              clienteEncontrado?.statusVendaLabel ||
              clienteEncontrado?.statusVenda ||
              contrato.statusLabel ||
              contrato.status,
            statusVenda:
              contrato.statusVenda ||
              contrato.statusVendaLabel ||
              clienteEncontrado?.statusVenda ||
              clienteEncontrado?.statusVendaLabel ||
              contrato.statusLabel ||
              contrato.status,
            pendenciaCadastroLabel:
              contrato.pendenciaCadastroLabel ||
              contrato.pendenciaCadastro ||
              clienteEncontrado?.pendenciaCadastroLabel ||
              clienteEncontrado?.pendenciaCadastro,
            pendenciaCadastro:
              contrato.pendenciaCadastro ||
              clienteEncontrado?.pendenciaCadastro ||
              clienteEncontrado?.pendenciaCadastroLabel,
            statusPagamentoLabel:
              contrato.statusPagamentoLabel ||
              contrato.statusPagamento ||
              clienteEncontrado?.statusPagamentoLabel ||
              clienteEncontrado?.statusPagamento,
            statusPagamento:
              contrato.statusPagamento ||
              clienteEncontrado?.statusPagamento ||
              clienteEncontrado?.statusPagamentoLabel,
            cliente: clienteEncontrado || {},
            clienteContratosCount: contratosDoCliente.length,
            clienteComContratosDuplicados: contratosDoCliente.length > 1,
            clienteNaoEncontrado: !clienteEncontrado,
          };
        });

        vendasComClientes.sort(
          (a, b) =>
            dataValor(b.criadoEm || b.dataContratacao) -
            dataValor(a.criadoEm || a.dataContratacao)
        );

        setVendas(vendasComClientes);
        setClientes(listaClientes);
      } catch (error) {
        console.error("Erro ao carregar vendas:", error);

        setErro(
          error.code === "permission-denied"
            ? "O Firebase bloqueou a consulta. Verifique as regras do Firestore."
            : `Erro ao carregar vendas: ${error.message || "erro desconhecido"}`
        );
      } finally {
        setCarregando(false);
        setAtualizando(false);
      }
    },
    [usuario]
  );

  useEffect(() => {
    carregarVendas();
  }, [carregarVendas]);

  // ===================================================
  // ATUALIZAR FILTROS
  // ===================================================

  function alterarFiltro(campo, valor) {
    setFiltros((atual) => ({
      ...atual,
      [campo]: valor,
    }));
  }

  function limparFiltros() {
    setBusca("");

    setFiltros({
      limite: "50",
      contrato: "",
      titular: "",
      cpf: "",
      dependente: "",
      celular: "",
      cep: "",
      plano: "",
      formaPagamento: "",
      periodicidade: "",
      canalVenda: "",
      pendencia: "",
      vendedor: "",
      status: "",
      indicador: "",
      dataVendaInicial: "",
      dataVendaFinal: "",
      dataAtivacaoInicial: "",
      dataAtivacaoFinal: "",
      ativoInativo: "todos",
    });
  }

  // Carteirinhas exibidas: venda ativa regularizada pelo Pagar.me ou pela ENEL.
  const carteirinhasRegularizadas = useMemo(
    () => vendas.filter(ehCarteirinhaRegularizada),
    [vendas]
  );

  // ===================================================
  // APLICAR FILTROS
  // ===================================================

  const vendasFiltradas = useMemo(() => {
    const resultado = carteirinhasRegularizadas.filter((venda) => {
      const cliente = venda.cliente || {};

      const status = identificarStatus(venda);
      const pendencia = identificarPendencia(venda);

      const textoBusca = normalizar(busca);

      const correspondeBusca =
        !textoBusca ||
        [
          cliente.nomeCompleto,
          cliente.cpf,
          venda.id,
          venda.planoNome,
          venda.vendedorNome,
          cliente.celular,
        ].some((valor) =>
          normalizar(valor).includes(textoBusca)
        );

      const correspondeContrato =
        !filtros.contrato ||
        normalizar(venda.id).includes(
          normalizar(filtros.contrato)
        );

      const correspondeTitular =
        !filtros.titular ||
        normalizar(cliente.nomeCompleto).includes(
          normalizar(filtros.titular)
        );

      const correspondeCPF =
        !filtros.cpf ||
        numeros(cliente.cpf).includes(numeros(filtros.cpf));

      const correspondeCelular =
        !filtros.celular ||
        numeros(cliente.celular || cliente.telefone).includes(
          numeros(filtros.celular)
        );

      const correspondeCEP =
        !filtros.cep ||
        numeros(cliente.cep).includes(numeros(filtros.cep));

      const correspondePlano =
        !filtros.plano ||
        normalizar(venda.planoNome).includes(
          normalizar(filtros.plano)
        );

      const correspondePagamento =
        !filtros.formaPagamento ||
        normalizar(
          `${venda.formaPagamento || ""} ${venda.origemVendaLabel || ""}`
        ).includes(normalizar(filtros.formaPagamento));

      const statusPagamento =
        venda.statusPagamentoLabel || venda.statusPagamento || "Não informado";

      const correspondeStatusPagamento =
        !filtros.statusPagamento ||
        normalizar(statusPagamento).includes(normalizar(filtros.statusPagamento));

      const correspondePeriodicidade =
        !filtros.periodicidade ||
        normalizar(venda.periodicidade).includes(
          normalizar(filtros.periodicidade)
        );

      const correspondeCanal =
        !filtros.canalVenda ||
        normalizar(venda.canalVenda).includes(
          normalizar(filtros.canalVenda)
        );

      const correspondePendencia =
        !filtros.pendencia ||
        normalizar(pendencia.texto).includes(
          normalizar(filtros.pendencia)
        );

      const nomesDependentes = Array.isArray(venda.dependentes)
        ? venda.dependentes.map((item) => item?.nome || item?.nomeCompleto || "").join(" ")
        : String(venda.dependentesNomes || venda.dependenteNome || "");

      const correspondeDependente =
        !filtros.dependente ||
        normalizar(nomesDependentes).includes(normalizar(filtros.dependente));

      const correspondeIndicador =
        !filtros.indicador ||
        normalizar(venda.indicador || venda.indicadorNome || venda.origemIndicacao || "").includes(
          normalizar(filtros.indicador)
        );

      const correspondeVendedor =
        !filtros.vendedor ||
        normalizar(venda.vendedorNome).includes(
          normalizar(filtros.vendedor)
        );

      const correspondeStatus =
        !filtros.status ||
        normalizar(status.texto).includes(
          normalizar(filtros.status)
        );

      const dataVenda = dataValor(
        venda.criadoEm || venda.dataContratacao
      );

      const dataAtivacao = dataValor(
        venda.dataAtivacao || venda.ativadoEm
      );

      const vendaInicial = filtros.dataVendaInicial
        ? new Date(`${filtros.dataVendaInicial}T00:00:00`).getTime()
        : 0;

      const vendaFinal = filtros.dataVendaFinal
        ? new Date(`${filtros.dataVendaFinal}T23:59:59`).getTime()
        : Infinity;

      const ativacaoInicial = filtros.dataAtivacaoInicial
        ? new Date(`${filtros.dataAtivacaoInicial}T00:00:00`).getTime()
        : 0;

      const ativacaoFinal = filtros.dataAtivacaoFinal
        ? new Date(`${filtros.dataAtivacaoFinal}T23:59:59`).getTime()
        : Infinity;

      const correspondeDataVenda =
        (!filtros.dataVendaInicial || dataVenda >= vendaInicial) &&
        (!filtros.dataVendaFinal || dataVenda <= vendaFinal);

      const correspondeDataAtivacao =
        (!filtros.dataAtivacaoInicial ||
          (dataAtivacao && dataAtivacao >= ativacaoInicial)) &&
        (!filtros.dataAtivacaoFinal ||
          (dataAtivacao && dataAtivacao <= ativacaoFinal));

      const correspondeAtivo =
        filtros.ativoInativo === "todos" ||
        (filtros.ativoInativo === "ativos" &&
          status.classe === "tv-status-ativo") ||
        (filtros.ativoInativo === "inativos" &&
          status.classe !== "tv-status-ativo");

      return (
        correspondeBusca &&
        correspondeContrato &&
        correspondeTitular &&
        correspondeCPF &&
        correspondeCelular &&
        correspondeCEP &&
        correspondePlano &&
        correspondePagamento &&
        correspondeStatusPagamento &&
        correspondePeriodicidade &&
        correspondeCanal &&
        correspondePendencia &&
        correspondeDependente &&
        correspondeIndicador &&
        correspondeVendedor &&
        correspondeStatus &&
        correspondeDataVenda &&
        correspondeDataAtivacao &&
        correspondeAtivo
      );
    });

    const limite = Number(filtros.limite);

    return limite > 0
      ? resultado.slice(0, limite)
      : resultado;
  }, [carteirinhasRegularizadas, busca, filtros]);

  // ===================================================
  // ABRIR CONTRATO PARA VISUALIZAÇÃO
  // ===================================================

  async function visualizarContrato(venda) {
    setContratoSelecionado(venda);
    setClienteSelecionado(venda.cliente || {});
    setModalAberto(true);
    setAbaModal("dados");
    setCarregandoModal(true);

    setDependentes([]);
    setNotificacoes([]);
    setHistorico([]);
    setErroHistorico("");
    setAgendamentos([]);

    const contratoId = venda.id;
    const clienteId = venda.clienteId;

    // Cada consulta é independente: falha em agendamentos/notificações,
    // por exemplo, não pode apagar nem impedir a leitura do histórico.
    const [
      dependentesResultado,
      notificacoesResultado,
      historicoContratoResultado,
      historicoClienteResultado,
      historicoCentralResultado,
      agendamentosResultado,
    ] = await Promise.allSettled([
      getDocs(collection(db, "contratos", contratoId, "dependentes")),
      getDocs(collection(db, "contratos", contratoId, "notificacoes")),
      getDocs(collection(db, "contratos", contratoId, "historico")),
      clienteId
        ? getDocs(collection(db, "clientes", clienteId, "historico"))
        : Promise.resolve({ docs: [] }),
      getDocs(
        collection(db, "historicoContratos", contratoId, "eventos")
      ),
      getDocs(collection(db, "contratos", contratoId, "agendamentos")),
    ]);

    const obterDocumentos = (resultado, nome) => {
      if (resultado.status === "fulfilled") {
        return resultado.value?.docs || [];
      }

      console.error(`Erro ao consultar ${nome}:`, resultado.reason);
      return null;
    };

    try {
      const dependentesDocs = obterDocumentos(
        dependentesResultado,
        "dependentes"
      );
      const notificacoesDocs = obterDocumentos(
        notificacoesResultado,
        "notificações"
      );
      const historicoContratoDocs = obterDocumentos(
        historicoContratoResultado,
        "histórico do contrato"
      );
      const historicoClienteDocs = obterDocumentos(
        historicoClienteResultado,
        "histórico do cliente"
      );
      const historicoCentralDocs = obterDocumentos(
        historicoCentralResultado,
        "histórico central do contrato"
      );
      const agendamentosDocs = obterDocumentos(
        agendamentosResultado,
        "agendamentos"
      );

      if (dependentesDocs) {
        setDependentes(
          dependentesDocs.map((item) => ({
            id: item.id,
            ...item.data(),
          }))
        );
      }

      if (notificacoesDocs) {
        setNotificacoes(
          notificacoesDocs.map((item) => ({
            id: item.id,
            ...item.data(),
          }))
        );
      }

      if (agendamentosDocs) {
        setAgendamentos(
          agendamentosDocs.map((item) => ({
            id: item.id,
            ...item.data(),
          }))
        );
      }

      // O histórico central do cliente é a linha do tempo principal.
      // O histórico do contrato é consultado para preservar registros antigos.
      const eventosHistorico = [
        ...(historicoClienteDocs || []).map((item) => ({
          id: item.id,
          origemHistorico: "cliente",
          ...item.data(),
        })),
        ...(historicoContratoDocs || []).map((item) => ({
          id: item.id,
          origemHistorico: "contrato",
          ...item.data(),
        })),
        ...(historicoCentralDocs || []).map((item) => ({
          id: item.id,
          origemHistorico: "central",
          ...item.data(),
        })),
      ];

      // Deduplica eventos espelhados nas duas subcoleções.
      // Registros antigos sem eventoId continuam preservados.
      const eventosUnicos = [];
      const chavesEventos = new Set();

      eventosHistorico.forEach((item) => {
        const chave = item.eventoId
          ? `evento-${item.eventoId}`
          : `${item.origemHistorico}-${item.id}`;

        if (chavesEventos.has(chave)) return;
        chavesEventos.add(chave);
        eventosUnicos.push(item);
      });

      setHistorico(
        eventosUnicos.sort(
          (a, b) => dataValor(b.criadoEm) - dataValor(a.criadoEm)
        )
      );

      const falhaHistoricoCliente = historicoClienteDocs === null;
      const falhaHistoricoContrato = historicoContratoDocs === null;
      const falhaHistoricoCentral = historicoCentralDocs === null;

      if (
        falhaHistoricoCliente &&
        falhaHistoricoContrato &&
        falhaHistoricoCentral
      ) {
        setErroHistorico(
          "Não foi possível consultar o histórico. Verifique as regras de leitura do Firestore e a conexão."
        );
      } else if (
        falhaHistoricoCliente ||
        falhaHistoricoContrato ||
        falhaHistoricoCentral
      ) {
        setErroHistorico(
          "Parte do histórico não pôde ser carregada. Os registros das outras origens foram exibidos."
        );
      }

      const houveFalhaComplementar = [
        dependentesDocs,
        notificacoesDocs,
        agendamentosDocs,
      ].some((docs) => docs === null);

      if (houveFalhaComplementar) {
        console.warn(
          "Uma ou mais consultas complementares falharam. As demais informações foram mantidas."
        );
      }
    } finally {
      setCarregandoModal(false);
    }
  }

  // ===================================================
  // EDITAR CONTRATO EXISTENTE
  // ===================================================

  function editarContrato(venda) {
    if (!venda?.id || !venda?.clienteId) {
      alert("Não foi possível identificar o cliente ou contrato.");
      return;
    }

    if (venda.clienteComContratosDuplicados) {
      alert(
        `Este cliente possui ${venda.clienteContratosCount} contratos vinculados. ` +
        "A edição foi bloqueada para evitar alterações no contrato errado. " +
        "Corrija a duplicidade antes de continuar."
      );
      return;
    }

    if (venda.clienteNaoEncontrado) {
      alert(
        "O cliente vinculado a este contrato não foi encontrado. " +
        "Verifique o vínculo antes de editar."
      );
      return;
    }

    sessionStorage.setItem(
      "clienteParaEditar",
      JSON.stringify({
        clienteId: venda.clienteId,
        contratoId: venda.id,
      })
    );

    setModalAberto(false);

    if (onNavigate) {
      onNavigate("/clientes/novo");
    } else {
      window.location.href = "/clientes/novo";
    }
  }

  // ===================================================
  // INDICADORES
  // ===================================================

  const totalAtivos = carteirinhasRegularizadas.filter(
    (item) =>
      identificarStatus(item).classe === "tv-status-ativo"
  ).length;

  const totalValor = carteirinhasRegularizadas.reduce(
    (total, item) => total + Number(item.valor || 0),
    0
  );

  const vendedores = [
    ...new Set(
      carteirinhasRegularizadas.map((item) => item.vendedorNome).filter(Boolean)
    ),
  ];

  const planos = [
    ...new Set(
      carteirinhasRegularizadas.map((item) => item.planoNome).filter(Boolean)
    ),
  ];

  // ===================================================
  // CAMPO DE FILTRO
  // ===================================================

  function CampoFiltro({
    label,
    campo,
    placeholder,
    type = "text",
    options,
  }) {
    return (
      <label className="tv-campo">
        <span>{label}</span>

        {options ? (
          <select
            value={filtros[campo]}
            onChange={(e) =>
              alterarFiltro(campo, e.target.value)
            }
          >
            <option value="">Todos</option>

            {options.map((opcao) => (
              <option key={opcao} value={opcao}>
                {opcao}
              </option>
            ))}
          </select>
        ) : (
          <input
            type={type}
            value={filtros[campo]}
            onChange={(e) =>
              alterarFiltro(campo, e.target.value)
            }
            placeholder={placeholder || ""}
          />
        )}
      </label>
    );
  }

  // ===================================================
  // MODAL DE VISUALIZAÇÃO
  // ===================================================

  function renderModal() {
    if (!modalAberto || !contratoSelecionado) return null;

    const contrato = contratoSelecionado;
    const cliente = clienteSelecionado || {};

    const abas = [
      { id: "dados", nome: "Dados do Contrato", Icone: FileText },
      { id: "plano", nome: "Plano Contratado", Icone: User },
      { id: "dependentes", nome: "Dependentes", Icone: Users },
      { id: "notificacoes", nome: "Notificações e Alertas", Icone: Bell },
      { id: "historico", nome: "Histórico", Icone: History },
      { id: "agendamentos", nome: "Agendamentos", Icone: CalendarDays },
    ];

    function campoVisualizacao(label, valor) {
      return (
        <div className="tv-visual-campo">
          <span>{label}</span>
          <strong>{valor || "—"}</strong>
        </div>
      );
    }

    return (
      <div
        className="tv-modal-fundo"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            setModalAberto(false);
          }
        }}
      >
        <section className="tv-modal" role="dialog" aria-modal="true">

          <header className="tv-modal-cabecalho">
            <h2>
              <Eye size={19} />
              Visualizar Contrato
            </h2>

            <button
              type="button"
              onClick={() => setModalAberto(false)}
              aria-label="Fechar"
            >
              <X size={19} />
            </button>
          </header>

          <nav className="tv-modal-abas">
            {abas.map(({ id, nome, Icone }) => (
              <button
                key={id}
                type="button"
                className={abaModal === id ? "ativo" : ""}
                onClick={() => setAbaModal(id)}
              >
                <Icone size={14} />
                {nome}
              </button>
            ))}
          </nav>

          <div className="tv-modal-conteudo">
            {contrato.clienteComContratosDuplicados && (
              <div className="tv-erro" role="alert">
                <AlertCircle size={17} />
                Este cliente possui {contrato.clienteContratosCount} contratos vinculados.
                A edição está bloqueada até a correção da duplicidade.
              </div>
            )}

            {contrato.clienteNaoEncontrado && (
              <div className="tv-erro" role="alert">
                <AlertCircle size={17} />
                O cliente vinculado não foi localizado na coleção de clientes.
              </div>
            )}

            {carregandoModal ? (
              <div className="tv-carregando">
                Carregando informações do contrato...
              </div>
            ) : (
              <>
                {abaModal === "dados" && (
                  <>
                    <div className="tv-grade-visual">
                      {campoVisualizacao(
                        "Número do contrato",
                        contrato.id
                      )}
                      {campoVisualizacao(
                        "Data da contratação",
                        dataLegivel(
                          contrato.criadoEm || contrato.dataContratacao
                        )
                      )}
                      {campoVisualizacao(
                        "Canal de venda",
                        contrato.canalVenda
                      )}
                      {campoVisualizacao(
                        "Vendedor",
                        contrato.vendedorNome
                      )}
                      {campoVisualizacao(
                        "Status da venda",
                        contrato.statusVendaLabel ||
                          contrato.statusVenda ||
                          contrato.statusLabel ||
                          contrato.status
                      )}
                      {campoVisualizacao(
                        "Pendência do cadastro",
                        identificarPendencia(contrato).texto
                      )}
                      {campoVisualizacao(
                        "Status do pagamento",
                        contrato.statusPagamentoLabel ||
                          contrato.statusPagamento ||
                          cliente.statusPagamentoLabel ||
                          cliente.statusPagamento ||
                          "Não informado"
                      )}
                      {campoVisualizacao(
                        "CPF do titular",
                        formatarCPF(cliente.cpf)
                      )}
                      {campoVisualizacao(
                        "Nome completo",
                        cliente.nomeCompleto
                      )}
                      {campoVisualizacao(
                        "Data de nascimento",
                        cliente.dataNascimento
                      )}
                      {campoVisualizacao("Sexo", cliente.sexo)}
                      {campoVisualizacao(
                        "Profissão",
                        cliente.profissao
                      )}
                      {campoVisualizacao(
                        "Estado civil",
                        cliente.estadoCivil
                      )}
                      {campoVisualizacao(
                        "Escolaridade",
                        cliente.escolaridade
                      )}
                      {campoVisualizacao(
                        "Nacionalidade",
                        cliente.nacionalidade
                      )}
                      {campoVisualizacao(
                        "Nome da mãe",
                        cliente.nomeMae
                      )}
                      {campoVisualizacao(
                        "Nome do pai",
                        cliente.nomePai
                      )}
                      {campoVisualizacao("CEP", cliente.cep)}
                      {campoVisualizacao(
                        "Endereço",
                        cliente.endereco
                      )}
                      {campoVisualizacao("Número", cliente.numero)}
                      {campoVisualizacao(
                        "Complemento",
                        cliente.complemento
                      )}
                      {campoVisualizacao("Bairro", cliente.bairro)}
                      {campoVisualizacao("Estado", cliente.estado)}
                      {campoVisualizacao("Cidade", cliente.cidade)}
                      {campoVisualizacao(
                        "Telefone",
                        cliente.telefone
                      )}
                      {campoVisualizacao("Celular", cliente.celular)}
                      {campoVisualizacao(
                        "WhatsApp",
                        cliente.whatsapp
                      )}
                      {campoVisualizacao("E-mail", cliente.email)}
                    </div>
                  </>
                )}

                {abaModal === "plano" && (
                  <div className="tv-grade-visual">
                    {campoVisualizacao("Plano", contrato.planoNome)}
                    {campoVisualizacao("Valor", dinheiro(contrato.valor))}
                    {campoVisualizacao(
                      "Periodicidade",
                      contrato.periodicidade
                    )}
                    {campoVisualizacao(
                      "Forma de pagamento",
                      contrato.formaPagamento
                    )}
                    {campoVisualizacao(
                      "Quantidade de dependentes",
                      contrato.quantidadeDependentes
                    )}
                    {campoVisualizacao(
                      "Dependentes Plus",
                      contrato.dependentesPlus
                    )}
                    {campoVisualizacao(
                      "Data de ativação",
                      dataLegivel(
                        contrato.dataAtivacao || contrato.ativadoEm
                      )
                    )}
                    {campoVisualizacao(
                      "Data de expiração",
                      dataLegivel(contrato.dataExpiracao)
                    )}
                    {campoVisualizacao(
                      "Observações",
                      contrato.observacoesVendedor
                    )}
                  </div>
                )}

                {abaModal === "dependentes" && (
                  dependentes.length ? (
                    <div className="tv-lista-modal">
                      {dependentes.map((item) => (
                        <article key={item.id}>
                          <strong>{item.nome || "Dependente"}</strong>
                          <span>
                            CPF: {formatarCPF(item.cpf)} ·{" "}
                            {item.parentesco || item.relacao || "Vínculo não informado"}
                          </span>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="tv-sem-dados">
                      Nenhum dependente cadastrado.
                    </p>
                  )
                )}

                {abaModal === "notificacoes" && (
                  notificacoes.length ? (
                    <div className="tv-lista-modal">
                      {notificacoes.map((item) => (
                        <article key={item.id}>
                          <strong>
                            {item.assunto || item.titulo || "Notificação"}
                          </strong>
                          <span>
                            {item.descricao || item.mensagem || "Sem descrição"}
                          </span>
                          <small>{dataLegivel(item.criadoEm)}</small>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="tv-sem-dados">
                      Nenhuma notificação registrada.
                    </p>
                  )
                )}

                {abaModal === "historico" && (
                  <>
                    {erroHistorico && (
                      <div className="tv-erro" role="alert">
                        <AlertCircle size={17} />
                        {erroHistorico}
                      </div>
                    )}
                    {historico.length ? (
                    <div className="tv-lista-modal">
                      {historico.map((item) => (
                        <article key={item.id}>
                          <strong>
                            {item.tipo || "Movimentação"}
                          </strong>
                          <span>
                            {item.descricao || "Sem descrição"}
                          </span>
                          <small>
                            {item.usuarioNome || "Sistema"} ·{" "}
                            {dataLegivel(item.criadoEm)} ·{" "}
                            {item.origemHistorico === "cliente"
                              ? "Histórico do cliente"
                              : item.origemHistorico === "central"
                                ? "Histórico central"
                                : "Histórico do contrato"}
                          </small>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="tv-sem-dados">
                      {erroHistorico
                        ? "Não foi possível carregar os registros do histórico."
                        : "Nenhum histórico registrado."}
                    </p>
                  )}
                  </>
                )}

                {abaModal === "agendamentos" && (
                  agendamentos.length ? (
                    <div className="tv-lista-modal">
                      {agendamentos.map((item) => (
                        <article key={item.id}>
                          <strong>
                            {item.titulo || item.tipo || "Agendamento"}
                          </strong>
                          <span>
                            {item.descricao || item.especialidade || "—"}
                          </span>
                          <small>
                            {dataLegivel(item.data || item.criadoEm)}
                          </small>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="tv-sem-dados">
                      Nenhum agendamento encontrado nesta coleção do contrato.
                    </p>
                  )
                )}
              </>
            )}
          </div>

          <footer className="tv-modal-rodape">
            <button
              type="button"
              className="tv-botao-secundario"
              onClick={() => setModalAberto(false)}
            >
              Fechar contrato
            </button>

            <button
              type="button"
              className="tv-botao-editar"
              onClick={() => editarContrato(contrato)}
              disabled={
                contrato.clienteComContratosDuplicados ||
                contrato.clienteNaoEncontrado
              }
            >
              <Pencil size={15} />
              Editar cadastro
            </button>
          </footer>
        </section>
      </div>
    );
  }

  // ===================================================
  // TELA PRINCIPAL
  // ===================================================

  return (
    <main className="todas-vendas todas-carteirinhas">

      <header className="tv-cabecalho">
        <div>
          <h1>Todas as Carteirinhas</h1>
          <div className="tv-breadcrumb">
            <span>Painel</span>
            <span>/</span>
            <strong>Todas as Carteirinhas</strong>
          </div>
        </div>

        <button
          type="button"
          className="tv-atualizar"
          onClick={() => carregarVendas(true)}
          disabled={atualizando}
        >
          <RefreshCw
            size={16}
            className={atualizando ? "tv-girando" : ""}
          />
          Atualizar
        </button>
      </header>

      {/* INDICADORES */}

      <section className="tv-indicadores">
        <article>
          <span>Total de carteirinhas regularizadas</span>
          <strong>{carteirinhasRegularizadas.length}</strong>
          <FileText size={22} />
        </article>

        <article>
          <span>Carteirinhas ativas</span>
          <strong>{totalAtivos}</strong>
          <CheckCircle2 size={22} />
        </article>

        <article>
          <span>Clientes com dependentes</span>
          <strong>{carteirinhasRegularizadas.filter((item) => Number(item.quantidadeDependentes || item.dependentes?.length || 0) > 0).length}</strong>
          <Users size={22} />
        </article>

        <article>
          <span>Planos diferentes</span>
          <strong>{planos.length}</strong>
          <CheckCircle2 size={22} />
        </article>

        <article>
          <span>Valor total registrado</span>
          <strong>{dinheiro(totalValor)}</strong>
        </article>
      </section>

      {/* FILTROS */}

      <section className="tv-painel">

        <button
          type="button"
          className="tv-filtros-titulo"
          onClick={() => setFiltrosAbertos((valor) => !valor)}
        >
          <span>
            <Filter size={16} />
            Filtrar
          </span>

          {filtrosAbertos ? (
            <ChevronUp size={18} />
          ) : (
            <ChevronDown size={18} />
          )}
        </button>

        {filtrosAbertos && (
          <div className="tv-filtros-conteudo">

            <CampoFiltro
              label="Limite de registros"
              campo="limite"
              type="number"
            />

            <CampoFiltro
              label="Nº do contrato"
              campo="contrato"
            />

            <CampoFiltro
              label="Titular"
              campo="titular"
              placeholder="Nome do cliente"
            />

            <CampoFiltro
              label="CPF"
              campo="cpf"
              placeholder="CPF"
            />

            <CampoFiltro
              label="Dependente"
              campo="dependente"
              placeholder="Nome do dependente"
            />

            <CampoFiltro
              label="Celular"
              campo="celular"
            />

            <CampoFiltro
              label="CEP"
              campo="cep"
            />

            <CampoFiltro
              label="Plano"
              campo="plano"
              options={planos}
            />

            <CampoFiltro
              label="Forma de pagamento"
              campo="formaPagamento"
              options={[
                "Cartão",
                "Cartão de Crédito",
                "Pix",
                "Boleto",
                "Dinheiro",
                "Link Asaas",
                "ENEL",
              ]}
            />

            <CampoFiltro
              label="Status do pagamento"
              campo="statusPagamento"
              placeholder="Digite o status do pagamento"
            />

            <CampoFiltro
              label="Periodicidade"
              campo="periodicidade"
              options={["Mensal", "Anual", "Semestral"]}
            />

            <CampoFiltro
              label="Canal de venda"
              campo="canalVenda"
              options={[
                "Google",
                "WhatsApp",
                "Indicação",
                "Site",
                "Presencial",
              ]}
            />

            <CampoFiltro
              label="Pendência do cadastro"
              campo="pendencia"
              options={[
                "Adesão paga - Assinatura Gerada",
                "Adesão paga - Boleto",
                "Aguardando Restante do Pagamento",
                "Aprovado Semestral",
                "Avaliação de Cancelamento Enel",
                "Cancelado",
                "Cartão Não Aceito",
                "Cartão Sem Limite",
                "Carteirinha Enviada",
                "Cliente com Dúvidas",
                "Dados do Cartão Errado",
                "Desistência",
                "Enel - Aguardando Liberação",
                "Enviar as Carteirinhas",
                "Falta Auditar",
                "Inadimplente",
                "Não Autorizado pelo Cliente / Ligar e Autorizar",
                "Recadastrado Aguardando",
                "Renovado - Carteirinha Enviada",
                "Renovado - Enviar Carteirinhas",
                "Renovado com UP Enviar Carteirinha Plus",
                "Retirar Carteirinhas na Clínica",
                "UC Inexistente",
                "UP Realizado Enviar Carteirinha Plus",
                "Venda Auditada Enel",
                "Dados inconsistentes",
                "Cliente não é Enel",
                "EM CONTATO - REVERSÃO",
                "Sem forma de pagamento",
                "TRANSAÇÃO INVALIDA",
                "Enel - Encaminhado para cancelamento",
                "PIX NEGADO POR SALDO INSUFICIENTE",
                "PIX NEGADO POR SEGURANÇA",
                "AGUARDANDO APROVAÇÃO PIX PARCELADO",
                "AGUARDANDO PAGAMENTO DO LINK",
                "PAGO",
                "SOLICITAÇÃO DE AGENDAMENTO",
                "CONSULTA AGENDADA / FALTA ENVIAR VOUCHER",
                "VOUCHER ENVIADO",
                "CLIENTE SOLICITOU CANCELAMENTO DO PLANO",
                "AGUARDANDO AGENDA",
                "EXAME VENDIDO / FALTA AGENDAR",
                "AGENDAMENTO DE EXAME REALIZADO / FALTA ENVIAR VOUCHER",
                "VOUCHER DE EXAME ENVIADO",
                "SOLICITAÇÃO DE ESTORNO DE EXAME",
                "NÃO RENOVAR",
                "AGUARDANDO PAGAMENTO DA CONSULTA PARA LIBERAR VOUCHER",
                "AGUARDANDO ANÁLISE CONTESTAÇÃO CHARGEBACK",
                "NÃO TEM CONTRATO ASSINADO",
              ]}
            />

            <CampoFiltro
              label="Vendedor"
              campo="vendedor"
              options={vendedores}
            />

            <CampoFiltro
              label="Status da venda"
              campo="status"
              options={[
                "Ativo",
                "Pendente",
                "Em análise",
                "Cancelado",
                "Inativo",
              ]}
            />

            <CampoFiltro
              label="Indicador"
              campo="indicador"
            />

            <CampoFiltro
              label="Data da venda inicial"
              campo="dataVendaInicial"
              type="date"
            />

            <CampoFiltro
              label="Data da venda final"
              campo="dataVendaFinal"
              type="date"
            />

            <CampoFiltro
              label="Data de ativação inicial"
              campo="dataAtivacaoInicial"
              type="date"
            />

            <CampoFiltro
              label="Data de ativação final"
              campo="dataAtivacaoFinal"
              type="date"
            />

            <label className="tv-campo">
              <span>Ativos / Inativos</span>
              <select
                value={filtros.ativoInativo}
                onChange={(e) =>
                  alterarFiltro("ativoInativo", e.target.value)
                }
              >
                <option value="todos">Todos</option>
                <option value="ativos">Ativos</option>
                <option value="inativos">Inativos</option>
              </select>
            </label>

            <div className="tv-filtros-acoes">
              <button
                type="button"
                className="tv-limpar"
                onClick={limparFiltros}
              >
                Limpar
              </button>

              <button
                type="button"
                className="tv-filtrar"
                onClick={() => setFiltrosAbertos(false)}
              >
                Filtrar
              </button>
            </div>
          </div>
        )}
      </section>

      {/* LISTAGEM */}

      <section className="tv-tabela-painel">

        <div className="tv-tabela-topo">
          <label className="tv-busca">
            <Search size={17} />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por cliente, CPF, contrato, plano ou vendedor..."
            />
          </label>

          <span>
            {vendasFiltradas.length} registro(s) encontrado(s)
          </span>
        </div>

        {erro && (
          <div className="tv-erro">
            <AlertCircle size={17} />
            {erro}
          </div>
        )}

        {carregando ? (
          <div className="tv-vazio">Carregando vendas...</div>
        ) : vendasFiltradas.length === 0 ? (
          <div className="tv-vazio">
            <FileText size={30} />
            <strong>Nenhuma carteirinha regularizada encontrada</strong>
            <span>Confira os filtros ou tente atualizar os dados.</span>
          </div>
        ) : (
          <div className="tv-tabela-scroll">
            <table className="tv-tabela">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Titular</th>
                  <th>CPF</th>
                  <th>Celular</th>
                  <th>Cidade</th>
                  <th>Data da venda</th>
                  <th>Ativação</th>
                  <th>Plano</th>
                  <th>Forma de pagamento</th>
                  <th>Status do pagamento</th>
                  <th>Tipo</th>
                  <th>Vendedor</th>
                  <th>Valor</th>
                  <th>Status da venda</th>
                  <th>Pendência do cadastro</th>
                  <th>Ações</th>
                </tr>
              </thead>

              <tbody>
                {vendasFiltradas.map((venda) => {
                  const cliente = venda.cliente || {};
                  const status = identificarStatus(venda);
                  const pendencia = identificarPendencia(venda);

                  return (
                    <tr key={venda.id}>
                      <td>
                        {venda.id.slice(0, 8)}
                        {venda.clienteComContratosDuplicados && (
                          <small className="tv-pendencia tv-pendencia-alerta" title="Mais de um contrato vinculado ao cliente">
                            ⚠ Duplicidade
                          </small>
                        )}
                        {venda.clienteNaoEncontrado && (
                          <small className="tv-pendencia tv-pendencia-alerta" title="Cliente vinculado não encontrado">
                            ⚠ Sem cliente
                          </small>
                        )}
                      </td>

                      <td>
                        <strong>
                          {cliente.nomeCompleto || venda.clienteNome || "Não informado"}
                        </strong>
                      </td>

                      <td>{formatarCPF(cliente.cpf || venda.clienteCPF)}</td>

                      <td>
                        {cliente.celular || cliente.telefone || "—"}
                      </td>

                      <td>{cliente.cidade || "—"}</td>

                      <td>
                        {dataLegivel(venda.criadoEm || venda.dataContratacao)}
                      </td>

                      <td>
                        {dataLegivel(venda.dataAtivacao || venda.ativadoEm)}
                      </td>

                      <td>{venda.planoNome || "Não definido"}</td>

                      <td>
                        {venda.formaPagamento || "—"}
                        {venda.origemVendaLabel === "ENEL" &&
                        !normalizar(venda.formaPagamento).includes("enel")
                          ? " / ENEL"
                          : ""}
                      </td>

                      <td>{venda.statusPagamentoLabel || venda.statusPagamento || "Não informado"}</td>

                      <td>{venda.periodicidade || "—"}</td>

                      <td>{venda.vendedorNome || "—"}</td>

                      <td>{dinheiro(venda.valor)}</td>

                      <td>
                        <span className={`tv-status ${status.classe}`}>
                          <i />
                          {status.texto}
                        </span>
                      </td>

                      <td>
                        <span className={`tv-pendencia ${pendencia.classe}`}>
                          {pendencia.texto}
                        </span>
                      </td>

                      <td>
                        <div className="tv-acoes">
                          <button
                            type="button"
                            className="tv-acao-visualizar"
                            title="Visualizar contrato"
                            onClick={() => visualizarContrato(venda)}
                          >
                            <Eye size={17} />
                          </button>

                          <button
  type="button"
  className="tv-acao-editar"
  onClick={() => editarContrato(venda)}
  disabled={
    !venda.clienteId ||
    venda.clienteComContratosDuplicados ||
    venda.clienteNaoEncontrado
  }
  title={
    venda.clienteComContratosDuplicados
      ? "Cliente com mais de um contrato: edição bloqueada"
      : venda.clienteNaoEncontrado
        ? "Cliente vinculado não encontrado"
        : "Editar cadastro"
  }
>
  <Pencil size={17} />
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

        <footer className="tv-rodape">
          Exibindo {vendasFiltradas.length} de {carteirinhasRegularizadas.length} carteirinha(s) regularizada(s).
          Total de clientes vinculados: {clientes.length}. Os contratos aguardando pagamento ou auditoria ficam em Pendentes.
        </footer>
      </section>

      {renderModal()}
    </main>
  );
}
