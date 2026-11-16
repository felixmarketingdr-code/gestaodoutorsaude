import { useCallback, useEffect, useMemo, useState } from "react";

import {
  collection,
  getDocs,
  getDoc,
  doc,
  query,
  where,
  writeBatch,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

import {
  Search,
  RefreshCw,
  UserPlus,
  UserRound,
  CreditCard,
  Zap,
  IdCard,
  MessageCircle,
  AlertCircle,
  CheckCircle2,
  Clock3,
  X,
  Printer,
  FileText,
  ChevronRight,
} from "lucide-react";

import { db } from "../config/firebase";
import Checkout from "./Checkout";
import "./VendaCarteirinha.css";

// Catálogo oficial de pendências do contrato. Os nomes são preservados.
const PENDENCIAS_CONTRATO = [
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
];

// Estes são os únicos status gerais existentes no seletor do sistema.
const STATUS_VENDA_VALIDOS = ["Ativo", "Pendente", "Em análise", "Cancelado", "Inativo"];

function obterStatusVenda(contrato) {
  const valor = contrato?.statusVendaLabel || contrato?.statusVenda || contrato?.statusLabel || contrato?.status;
  return STATUS_VENDA_VALIDOS.find((item) => normalizarStatus(item) === normalizarStatus(valor)) || "Pendente";
}

// ===================================================
// FUNÇÕES AUXILIARES
// ===================================================

function somenteNumeros(valor) {
  return String(valor || "").replace(/\D/g, "");
}

function formatarCPF(valor) {
  const cpf = somenteNumeros(valor).slice(0, 11);

  return cpf
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

function normalizarStatus(status) {
  return String(status || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function dinheiro(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function dataLegivel(valor) {
  if (!valor) return "Não informada";

  const data =
    typeof valor?.toDate === "function"
      ? valor.toDate()
      : new Date(valor);

  return Number.isNaN(data.getTime())
    ? "Não informada"
    : data.toLocaleDateString("pt-BR");
}

function obterDataAtivacao(contrato) {
  return (
    contrato?.dataAtivacao ||
    contrato?.ativadoEm ||
    contrato?.dataInicio ||
    contrato?.inicioVigencia ||
    null
  );
}

function statusEhAtivo(contrato) {
  const status = normalizarStatus(
    contrato?.statusVendaLabel ||
    contrato?.statusVenda ||
    contrato?.statusLabel ||
    contrato?.status
  );

  return status === "ativo";
}

function obterDataEvento(evento) {
  const valor =
    evento?.criadoEm ||
    evento?.data ||
    evento?.dataCriacao ||
    evento?.timestamp ||
    evento?.atualizadoEm;

  if (!valor) return null;

  const data =
    typeof valor?.toDate === "function"
      ? valor.toDate()
      : new Date(valor);

  return Number.isNaN(data.getTime()) ? null : data;
}

function textoEvento(evento) {
  return [
    evento?.tipo,
    evento?.descricao,
    evento?.formaPagamento,
    evento?.metodoPagamento,
    evento?.origem,
    evento?.observacao,
    evento?.titulo,
    evento?.planoNome,
    evento?.plano,
  ]
    .filter((valor) => valor !== null && valor !== undefined)
    .map((valor) => typeof valor === "object" ? JSON.stringify(valor) : String(valor))
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function eventoIndicaEnel(evento) {
  const texto = textoEvento(evento);
  return texto.includes("enel");
}

function eventoAtivouContrato(evento) {
  const tipo = normalizarStatus(evento?.tipo || "");
  const descricao = normalizarStatus(evento?.descricao || "");
  const statusNovo = normalizarStatus(
    evento?.statusNovo ||
    evento?.statusVendaNovo ||
    evento?.statusVenda ||
    evento?.statusLabel ||
    ""
  );

  const eventoDeAlteracao =
    tipo.includes("alteracao_status_venda") ||
    tipo.includes("alteracao_status") ||
    tipo.includes("status_venda");

  const descricaoIndicaAtivacao =
    /para\s+[\"']?ativo/.test(descricao) ||
    descricao.includes("status alterado") && descricao.includes("ativo");

  return (
    (eventoDeAlteracao && (statusNovo === "ativo" || descricaoIndicaAtivacao)) ||
    (statusNovo === "ativo" && Boolean(evento?.statusAnterior || evento?.statusVendaAnterior))
  );
}

function confirmarPagamentoPagarme(contrato) {
  const valores = [
    contrato?.statusPagamento,
    contrato?.statusPagamentoLabel,
    contrato?.statusFinanceiro,
    contrato?.statusFinanceiroLabel,
    contrato?.situacaoPagamento,
    contrato?.situacaoPagamentoLabel,
    contrato?.pagarmeStatus,
    contrato?.statusPagarme,
  ];

  return valores.some((valor) => {
    const status = normalizarStatus(valor);
    return ["pago", "aprovado", "paid", "capturado", "confirmado", "succeeded"].includes(status);
  });
}

function escaparHTML(valor) {
  return String(valor || "").replace(
    /[&<>"']/g,
    (caractere) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[caractere]
  );
}

// ===================================================
// COMPONENTE
// ===================================================

export default function VendaCarteirinha({
  usuario,
  onNavigate,
}) {
  const [clientes, setClientes] = useState([]);
  const [leads, setLeads] = useState([]);
  const [planos, setPlanos] = useState([]);
  const [planoSelecionadoId, setPlanoSelecionadoId] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState("");

  const [busca, setBusca] = useState("");
  const [clienteSelecionado, setClienteSelecionado] =
    useState(null);
  const [historicoContrato, setHistoricoContrato] = useState([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);

  const [formaPagamento, setFormaPagamento] = useState("cartao");

  const [ehAdmin, setEhAdmin] = useState(false);
  const [abrirPreview, setAbrirPreview] = useState(false);

  // Estados do checkout
  const [checkoutAberto, setCheckoutAberto] = useState(false);
  const [checkoutPlano, setCheckoutPlano] = useState(null);
  const [checkoutToken, setCheckoutToken] = useState("");
  const [carregandoCheckout, setCarregandoCheckout] = useState(false);
  const [salvandoPendencia, setSalvandoPendencia] = useState(false);

  const carregarHistoricoContrato = useCallback(async (contratoId) => {
    if (!contratoId) {
      setHistoricoContrato([]);
      setCarregandoHistorico(false);
      return [];
    }

    setCarregandoHistorico(true);

    try {
      const referencia = collection(
        db,
        "historicoContratos",
        contratoId,
        "eventos"
      );
      const snapshot = await getDocs(referencia);
      const eventos = snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data(),
      }));

      eventos.sort((a, b) => {
        return (obterDataEvento(b)?.getTime() || 0) -
          (obterDataEvento(a)?.getTime() || 0);
      });

      setHistoricoContrato(eventos);
      return eventos;
    } catch (error) {
      console.error("Erro ao carregar histórico do contrato:", error);
      setHistoricoContrato([]);
      return [];
    } finally {
      setCarregandoHistorico(false);
    }
  }, []);

  useEffect(() => {
    const contratoId = clienteSelecionado?.contratoAtual?.id || "";
    carregarHistoricoContrato(contratoId);
  }, [clienteSelecionado?.contratoAtual?.id, carregarHistoricoContrato]);

  // ===================================================
  // IDENTIFICAR PERMISSÃO
  // ===================================================

  const verificarAdministrador = useCallback(async () => {
    if (!usuario?.uid) {
      setEhAdmin(false);
      return false;
    }

    try {
      let claims = usuario.customClaims || {};

      if (typeof usuario.getIdTokenResult === "function") {
        const tokenResult = await usuario.getIdTokenResult(true);
        claims = tokenResult?.claims || claims;
      }

      const perfil = String(
        usuario.role ||
          usuario.perfil ||
          usuario.tipoUsuario ||
          claims.role ||
          claims.perfil ||
          ""
      ).toLowerCase();

      const administrador =
        ["admin", "administrador", "administracao"].includes(
          perfil
        ) ||
        claims.admin === true ||
        claims.administrador === true;

      setEhAdmin(administrador);

      return administrador;
    } catch (error) {
      console.error("Erro ao verificar administrador:", error);
      setEhAdmin(false);
      return false;
    }
  }, [usuario]);

  // ===================================================
  // CARREGAR CLIENTES
  // ===================================================

  const carregarClientes = useCallback(
    async (silencioso = false) => {
      if (!usuario?.uid) {
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
        const administrador = await verificarAdministrador();

        const clientesRef = collection(db, "clientes");
        const contratosRef = collection(db, "contratos");
        const leadsRef = collection(db, "leads");

        let clientesSnap;
        let contratosSnap;
        let leadsSnap = { docs: [] };

        if (administrador) {
          [clientesSnap, contratosSnap] = await Promise.all([
            getDocs(clientesRef),
            getDocs(contratosRef),
          ]);

          try {
            leadsSnap = await getDocs(leadsRef);
          } catch (erroLeads) {
            console.warn(
              "Não foi possível consultar a coleção leads:",
              erroLeads
            );
          }
        } else {
          const [clientesVendedor, contratosVendedor] =
            await Promise.all([
              getDocs(
                query(
                  clientesRef,
                  where("criadoPor", "==", usuario.uid)
                )
              ),
              getDocs(
                query(
                  contratosRef,
                  where("vendedorId", "==", usuario.uid)
                )
              ),
            ]);

          const ids = new Set([
            ...clientesVendedor.docs.map((item) => item.id),
            ...contratosVendedor.docs
              .map((item) => item.data().clienteId)
              .filter(Boolean),
          ]);

          const documentos = await Promise.all(
            [...ids].map((id) =>
              getDoc(doc(db, "clientes", id))
            )
          );

          clientesSnap = {
            docs: documentos.filter((item) => item.exists()),
          };

          contratosSnap = contratosVendedor;

          // Leads atribuídos ao vendedor são consultados separadamente.
          try {
            leadsSnap = await getDocs(leadsRef);
          } catch {
            const consultasLeads = await Promise.allSettled([
              getDocs(
                query(
                  leadsRef,
                  where("vendedorId", "==", usuario.uid)
                )
              ),
              getDocs(
                query(
                  leadsRef,
                  where("criadoPor", "==", usuario.uid)
                )
              ),
              getDocs(
                query(
                  leadsRef,
                  where("responsavelId", "==", usuario.uid)
                )
              ),
            ]);

            const porId = new Map();

            consultasLeads.forEach((resultado) => {
              if (resultado.status === "fulfilled") {
                resultado.value.docs.forEach((item) =>
                  porId.set(item.id, item)
                );
              }
            });

            leadsSnap = { docs: [...porId.values()] };
          }
        }

        const listaContratos = contratosSnap.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));

        const listaClientes = clientesSnap.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));

        const contratosPorCliente = new Map();

        listaContratos.forEach((contrato) => {
          if (!contrato.clienteId) return;

          const lista =
            contratosPorCliente.get(contrato.clienteId) || [];

          lista.push(contrato);

          contratosPorCliente.set(contrato.clienteId, lista);
        });

        const resultado = listaClientes.map((cliente) => {
          const lista = (
            contratosPorCliente.get(cliente.id) || []
          ).sort((a, b) => {
            const dataA =
              a.criadoEm?.toDate?.()?.getTime?.() ||
              new Date(a.criadoEm || 0).getTime();

            const dataB =
              b.criadoEm?.toDate?.()?.getTime?.() ||
              new Date(b.criadoEm || 0).getTime();

            return dataB - dataA;
          });

          return {
            ...cliente,
            contratos: lista,
            contratoAtual: lista[0] || null,
          };
        });

        setClientes(resultado);

        const listaLeads = leadsSnap.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));

        setLeads(listaLeads);

        // Recupera exatamente o cliente e o contrato criados no NovoContrato.jsx.
        const retornoSalvo = sessionStorage.getItem(
          "vendaCarteirinhaRetorno"
        );

        if (retornoSalvo) {
          try {
            const retorno = JSON.parse(retornoSalvo);

            const clienteRetornado = resultado.find(
              (item) => item.id === retorno.clienteId
            );

            if (clienteRetornado) {
              const contratoExato =
                clienteRetornado.contratos?.find(
                  (item) => item.id === retorno.contratoId
                ) || clienteRetornado.contratoAtual || null;

              const clienteComContrato = {
                ...clienteRetornado,
                contratoAtual: contratoExato,
              };

              setClienteSelecionado(clienteComContrato);

              setPlanoSelecionadoId(
                String(
                  contratoExato?.planoId ||
                  contratoExato?.idPlano ||
                  contratoExato?.plano?.id ||
                  ""
                )
              );

              setFormaPagamento("cartao");
              setBusca("");
              setAbrirPreview(false);

              sessionStorage.removeItem("vendaCarteirinhaRetorno");
            }
          } catch (error) {
            console.error(
              "Erro ao recuperar cliente da venda:",
              error
            );
          }
        }
      } catch (error) {
        console.error("Erro ao carregar clientes:", error);

        setErro(
          error.code === "permission-denied"
            ? "Sem permissão para consultar os clientes. Verifique as regras do Firestore."
            : error.message || "Erro ao carregar clientes."
        );
      } finally {
        setCarregando(false);
        setAtualizando(false);
      }
    },
    [usuario, verificarAdministrador]
  );

  useEffect(() => {
    carregarClientes();
  }, [carregarClientes]);

  // Carrega o catálogo de planos separadamente.
  useEffect(() => {
    let ativo = true;

    async function carregarPlanos() {
      try {
        const snapshot = await getDocs(collection(db, "planos"));

        if (!ativo) return;

        const lista = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));

        setPlanos(lista);

        if (clienteSelecionado?.contratoAtual) {
          const contrato = clienteSelecionado.contratoAtual;

          const idExistente =
            contrato.planoId ||
            contrato.idPlano ||
            contrato.plano?.id ||
            "";

          if (idExistente) {
            setPlanoSelecionadoId(String(idExistente));
          }
        }
      } catch (error) {
        console.error("Erro ao carregar planos:", error);
      }
    }

    carregarPlanos();

    return () => {
      ativo = false;
    };
  }, []);

  // ===================================================
  // BUSCAR CLIENTES
  // ===================================================

  const clientesFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const numeros = somenteNumeros(busca);

    if (!termo) return clientes.slice(0, 30);

    return clientes.filter((cliente) => {
      const nome = String(
        cliente.nomeCompleto || ""
      ).toLowerCase();

      const email = String(cliente.email || "").toLowerCase();

      const telefone = somenteNumeros(
        cliente.celular || cliente.telefone
      );

      const cpf = somenteNumeros(cliente.cpf);

      return (
        nome.includes(termo) ||
        email.includes(termo) ||
        (numeros && cpf.includes(numeros)) ||
        (numeros && telefone.includes(numeros))
      );
    });
  }, [clientes, busca]);

  // ===================================================
  // LEADS
  // ===================================================

  const leadsFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const numeros = somenteNumeros(busca);

    return leads.filter((lead) => {
      const jaConvertido =
        Boolean(lead.clienteId) ||
        Boolean(lead.contratoId) ||
        [
          "convertido",
          "em_cadastramento",
          "em cadastramento",
          "aguardando_pagamento",
          "aguardando pagamento",
          "ativo",
        ].includes(normalizarStatus(lead.status));

      if (jaConvertido) return false;
      if (!termo) return true;

      const nome = String(
        lead.nome || lead.nomeCompleto || lead.name || ""
      ).toLowerCase();

      const email = String(lead.email || "").toLowerCase();

      const telefone = somenteNumeros(
        lead.telefone || lead.celular || lead.whatsapp
      );

      const cpf = somenteNumeros(
        lead.cpf || lead.documento
      );

      return (
        nome.includes(termo) ||
        email.includes(termo) ||
        (numeros && telefone.includes(numeros)) ||
        (numeros && cpf.includes(numeros))
      );
    });
  }, [leads, busca]);

  // ===================================================
  // INDICADORES
  // ===================================================

  const indicadores = useMemo(() => {
    const contratos = clientes.flatMap(
      (cliente) => cliente.contratos || []
    );

    const ativos = contratos.filter(
      (contrato) => statusEhAtivo(contrato)
    ).length;

    const pendentes = contratos.filter((contrato) => {
      const status = normalizarStatus(obterStatusVenda(contrato));
      return status === "pendente" || status === "em analise";
    }).length;

    return {
      leads: leads.filter(
        (lead) => !lead.clienteId && !lead.contratoId
      ).length,
      oportunidades: clientes.filter(
        (cliente) => !cliente.contratoAtual
      ).length,
      pendentes,
      ativos,
    };
  }, [clientes, leads]);
    // ===================================================
  // SELECIONAR CLIENTE
  // ===================================================

  function selecionarCliente(cliente) {
    setClienteSelecionado(cliente);
    setAbrirPreview(false);

    const contrato = cliente?.contratoAtual || {};

    setPlanoSelecionadoId(
      String(
        contrato.planoId ||
        contrato.idPlano ||
        contrato.plano?.id ||
        ""
      )
    );
  }

  function limparSelecao() {
    setClienteSelecionado(null);
    setHistoricoContrato([]);
    setCarregandoHistorico(false);
    setAbrirPreview(false);
  }

  // ===================================================
  // INICIAR NOVO CADASTRO
  // ===================================================

  function iniciarNovoCadastro(dadosLead = null) {
    try {
      const leadSeguro =
        dadosLead && typeof dadosLead === "object"
          ? {
              ...dadosLead,
              id: String(dadosLead.id || ""),
              nome: String(
                dadosLead.nome ||
                dadosLead.nomeCompleto ||
                dadosLead.name ||
                ""
              ),
              nomeCompleto: String(
                dadosLead.nomeCompleto ||
                dadosLead.nome ||
                dadosLead.name ||
                ""
              ),
              telefone: String(
                dadosLead.telefone ||
                dadosLead.celular ||
                dadosLead.whatsapp ||
                ""
              ),
              celular: String(
                dadosLead.celular ||
                dadosLead.telefone ||
                dadosLead.whatsapp ||
                ""
              ),
              email: String(dadosLead.email || ""),
              cpf: String(
                dadosLead.cpf ||
                dadosLead.documento ||
                ""
              ),
            }
          : null;

      sessionStorage.setItem(
        "fluxoVendaCarteirinha",
        JSON.stringify({
          origem: "venda_carteirinha",
          formaPagamento,
          leadId: leadSeguro?.id || "",
          dadosLead: leadSeguro,
          criadoEm: new Date().toISOString(),
        })
      );

      if (typeof onNavigate === "function") {
        onNavigate("/clientes/novo");
      } else {
        window.location.href = "/clientes/novo";
      }
    } catch (error) {
      console.error("Erro ao iniciar cadastro:", error);
      alert("Não foi possível iniciar o cadastro.");
    }
  }

  // ===================================================
  // ATUALIZAR PENDÊNCIA OPERACIONAL DO CONTRATO
  // ===================================================

  async function atualizarPendenciaContrato(novaPendencia) {
    const contrato = clienteSelecionado?.contratoAtual;
    const clienteId = clienteSelecionado?.id;
    const contratoId = contrato?.id;

    if (!clienteId || !contratoId || !PENDENCIAS_CONTRATO.includes(novaPendencia)) {
      alert("Selecione uma pendência válida e confirme o contrato.");
      return;
    }

    const pendenciaAnterior = contrato.pendenciaCadastro || contrato.pendenciaCadastroLabel || "Não informada";
    if (pendenciaAnterior === novaPendencia) return;

    setSalvandoPendencia(true);
    try {
      const batch = writeBatch(db);
      const contratoRef = doc(db, "contratos", contratoId);
      const clienteRef = doc(db, "clientes", clienteId);
      const eventoRef = doc(collection(db, "historicoContratos", contratoId, "eventos"));
      const evento = {
        tipo: "alteracao_pendencia",
        descricao: `Pendência do contrato alterada de "${pendenciaAnterior}" para "${novaPendencia}".`,
        pendenciaAnterior,
        pendenciaNova: novaPendencia,
        statusVenda: obterStatusVenda(contrato),
        clienteId,
        contratoId,
        responsavelId: usuario?.uid || "",
        responsavelNome: usuario?.displayName || usuario?.nome || usuario?.email || "Usuário",
        criadoEm: serverTimestamp(),
        origem: "VendaCarteirinha",
      };

      batch.update(contratoRef, {
        pendenciaCadastro: novaPendencia,
        pendenciaCadastroLabel: novaPendencia,
        atualizadoEm: serverTimestamp(),
      });
      batch.update(clienteRef, {
        pendenciaCadastro: novaPendencia,
        pendenciaCadastroLabel: novaPendencia,
        contratoId,
        atualizadoEm: serverTimestamp(),
      });
      batch.set(eventoRef, evento);
      batch.set(doc(db, "clientes", clienteId, "historico", eventoRef.id), evento);
      batch.set(doc(db, "contratos", contratoId, "historico", eventoRef.id), evento);
      await batch.commit();

      await carregarClientes(true);
      const clienteAtualizado = clientes.find((item) => item.id === clienteId);
      if (clienteAtualizado) {
        setClienteSelecionado({
          ...clienteAtualizado,
          contratoAtual: {
            ...contrato,
            pendenciaCadastro: novaPendencia,
            pendenciaCadastroLabel: novaPendencia,
          },
        });
      }
    } catch (error) {
      console.error("Erro ao atualizar pendência do contrato:", error);
      alert(error.message || "Não foi possível atualizar a pendência.");
    } finally {
      setSalvandoPendencia(false);
    }
  }

  // ===================================================
  // CONTINUAR VENDA / ABRIR CHECKOUT
  // ===================================================

  async function continuarVenda() {
    if (!clienteSelecionado) {
      alert("Selecione um cliente primeiro.");
      return;
    }

    const contrato =
      clienteSelecionado.contratoAtual || null;

    // Fluxo de pagamento externo / ENEL permanece no cadastro original.
    if (formaPagamento === "enel") {
      sessionStorage.setItem(
        "continuarContratoVenda",
        JSON.stringify({
          clienteId: clienteSelecionado.id,
          contratoId: contrato?.id || "",
          formaPagamento: "ENEL",
        })
      );

      if (typeof onNavigate === "function") {
        onNavigate("/clientes/novo");
      } else {
        window.location.href = "/clientes/novo";
      }

      return;
    }

    if (typeof usuario?.getIdToken !== "function") {
      alert(
        "Não foi possível validar sua sessão. Entre novamente no sistema."
      );
      return;
    }

    // O contrato criado em NovoContrato pode estar inicialmente sem plano.
    // Nesse caso, o vendedor escolhe o plano aqui, antes de abrir o checkout.
    const planoId =
      planoSelecionadoId ||
      contrato?.planoId ||
      contrato?.idPlano ||
      contrato?.plano?.id ||
      "";

    if (!planoId) {
      alert(
        "Selecione o plano que será contratado antes de continuar."
      );
      return;
    }

    setCarregandoCheckout(true);

    try {
      const planoSnapshot = await getDoc(
        doc(db, "planos", String(planoId))
      );

      if (!planoSnapshot.exists()) {
        throw new Error(
          "O plano selecionado não foi encontrado na coleção planos."
        );
      }

      const token = await usuario.getIdToken();

      setCheckoutPlano({
        id: planoSnapshot.id,
        ...planoSnapshot.data(),
      });

      setCheckoutToken(token);
      setCheckoutAberto(true);
    } catch (error) {
      console.error("Erro ao preparar checkout:", error);

      alert(
        error.message ||
        "Não foi possível abrir o checkout."
      );
    } finally {
      setCarregandoCheckout(false);
    }
  }

  // ===================================================
  // CARTEIRINHA - PRÉ-REQUISITOS
  // ===================================================

  const contratoSelecionado =
    clienteSelecionado?.contratoAtual || null;

  const clienteAtivo = statusEhAtivo(contratoSelecionado);

  // A origem pode estar gravada diretamente no contrato ou nos eventos
  // históricos (ex.: "Plano Light configurado. Pagamento: Mensal / ENEL.").
  const origemContrato = normalizarStatus([
    contratoSelecionado?.formaPagamento,
    contratoSelecionado?.metodoPagamento,
    contratoSelecionado?.origemPagamento,
    contratoSelecionado?.tipoPagamento,
    contratoSelecionado?.plano?.formaPagamento,
  ].filter(Boolean).join(" "));

  const vendaEnel =
    origemContrato.includes("enel") ||
    historicoContrato.some(eventoIndicaEnel);

  // O evento de status deve registrar a mudança para Ativo.
  // A origem ENEL é confirmada separadamente pelo histórico do contrato.
  const eventoAtivacao = historicoContrato.find(eventoAtivouContrato);
  const ativacaoAdministrativaEnel = Boolean(vendaEnel && eventoAtivacao);

  // Cobrança criada/QR Code emitido não é pagamento confirmado.
  const pagamentoPagarmeConfirmado = confirmarPagamentoPagarme(contratoSelecionado);

  const origemLiberada = pagamentoPagarmeConfirmado || ativacaoAdministrativaEnel;

  const dataAtivacao =
    obterDataAtivacao(contratoSelecionado) ||
    (origemLiberada && eventoAtivacao
      ? obterDataEvento(eventoAtivacao)
      : null);

  const telefoneCliente = somenteNumeros(
    clienteSelecionado?.celular ||
    clienteSelecionado?.telefone
  );

  const podeGerarCarteirinha =
    ehAdmin &&
    clienteAtivo &&
    origemLiberada &&
    Boolean(clienteSelecionado?.nomeCompleto) &&
    Boolean(clienteSelecionado?.cpf) &&
    Boolean(dataAtivacao) &&
    !carregandoHistorico;

  // ===================================================
  // GERAR VISUALIZAÇÃO / IMPRESSÃO DA CARTEIRINHA
  // ===================================================

  function gerarCarteirinha() {
    if (!ehAdmin) {
      alert(
        "Somente administradores podem gerar carteirinhas."
      );
      return;
    }

    if (!clienteAtivo) {
      alert("Este cliente ainda não está com o contrato ativo.");
      return;
    }

    if (carregandoHistorico) {
      alert("Aguarde o carregamento do histórico do contrato.");
      return;
    }

    if (!origemLiberada) {
      alert(
        "Não foi possível liberar a carteirinha. Confirme o pagamento no Pagar.me ou verifique se a venda ENEL e a ativação administrativa estão registradas no histórico."
      );
      return;
    }

    if (!dataAtivacao) {
      alert(
        "Não foi encontrada a data de ativação do contrato. Verifique o cadastro antes de emitir a carteirinha."
      );
      return;
    }

    if (
      !clienteSelecionado?.nomeCompleto ||
      !clienteSelecionado?.cpf
    ) {
      alert(
        "O nome e o CPF do cliente são obrigatórios."
      );
      return;
    }

    setAbrirPreview(true);
  }

  function imprimirCarteirinha() {
    if (!podeGerarCarteirinha) {
      alert(
        "Não é possível emitir esta carteirinha. Verifique as permissões, o status e a data de ativação."
      );
      return;
    }

    const nome = escaparHTML(
      clienteSelecionado.nomeCompleto
    );

    const cpf = escaparHTML(
      formatarCPF(clienteSelecionado.cpf)
    );

    const ativacao = escaparHTML(
      dataLegivel(dataAtivacao)
    );

    const janela = window.open(
      "",
      "_blank",
      "width=900,height=650"
    );

    if (!janela) {
      alert(
        "O navegador bloqueou a janela de impressão. Permita pop-ups para este sistema."
      );
      return;
    }

    janela.document.write(`
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Carteirinha - ${nome}</title>

        <style>
          * {
            box-sizing: border-box;
          }

          body {
            margin: 0;
            padding: 40px;
            font-family: Arial, sans-serif;
            background: #f1f5f9;
          }

          .carteirinha {
            width: 340px;
            min-height: 205px;
            margin: 30px auto;
            padding: 24px;
            border-radius: 16px;
            background: #ffffff;
            border: 2px solid #174ea6;
            color: #17345f;
            box-shadow: 0 8px 25px rgba(0,0,0,.12);
          }

          .marca {
            font-size: 19px;
            font-weight: 800;
            color: #174ea6;
            margin-bottom: 25px;
          }

          .campo {
            margin-bottom: 17px;
          }

          .campo small {
            display: block;
            margin-bottom: 5px;
            font-size: 10px;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 1px;
          }

          .campo strong {
            font-size: 14px;
            color: #17345f;
          }

          .rodape {
            margin-top: 22px;
            padding-top: 12px;
            border-top: 1px solid #dbeafe;
            color: #64748b;
            font-size: 10px;
          }

          .acoes {
            display: flex;
            justify-content: center;
            margin-top: 25px;
          }

          button {
            padding: 12px 22px;
            border: 0;
            border-radius: 8px;
            background: #174ea6;
            color: white;
            font-weight: bold;
            cursor: pointer;
          }

          @media print {
            body {
              padding: 0;
              background: white;
            }

            .carteirinha {
              margin: 0;
              box-shadow: none;
            }

            .acoes {
              display: none;
            }
          }
        </style>
      </head>

      <body>
        <div class="carteirinha">
          <div class="marca">DOUTOR SAUDE FAMILIAR</div>

          <div class="campo">
            <small>Nome completo</small>
            <strong>${nome}</strong>
          </div>

          <div class="campo">
            <small>CPF</small>
            <strong>${cpf}</strong>
          </div>

          <div class="campo">
            <small>Data de ativação</small>
            <strong>${ativacao}</strong>
          </div>

          <div class="rodape">
            Carteirinha de identificação do beneficiário
          </div>
        </div>

        <div class="acoes">
          <button onclick="window.print()">
            Salvar / Imprimir carteirinha
          </button>
        </div>
      </body>
      </html>
    `);

    janela.document.close();
    janela.focus();
  }

  // ===================================================
  // ABRIR WHATSAPP
  // ===================================================

  function abrirWhatsApp() {
    if (!ehAdmin || !podeGerarCarteirinha) {
      alert(
        "Somente administradores podem encaminhar carteirinhas de contratos ativos e liberados."
      );
      return;
    }

    if (!telefoneCliente) {
      alert(
        "O cliente não possui telefone cadastrado."
      );
      return;
    }

    const mensagem = encodeURIComponent(
      `Olá, ${clienteSelecionado.nomeCompleto}! Sua carteirinha Doutor de Todos está disponível. Estamos encaminhando o documento para você.`
    );

    const url =
      `https://wa.me/${telefoneCliente}?text=${mensagem}`;

    window.open(
      url,
      "_blank",
      "noopener,noreferrer"
    );
  }

  // ===================================================
  // STATUS VISUAL
  // ===================================================

  function classeStatus(contrato) {
    const status = normalizarStatus(
      contrato?.statusLabel || contrato?.status
    );

    if (status === "ativo") {
      return "vc-status-ativo";
    }

    if (status === "cancelado") {
      return "vc-status-cancelado";
    }
        return "vc-status-neutro";
  }

  // ===================================================
  // EXIBIR CHECKOUT
  // ===================================================

  if (checkoutAberto && checkoutPlano && clienteSelecionado) {
    return (
      <Checkout
        plano={checkoutPlano}
        clienteId={clienteSelecionado.id}
        contratoId={clienteSelecionado.contratoAtual?.id || ""}
        cliente={{
          nomeCompleto: clienteSelecionado.nomeCompleto || "",
          nome: clienteSelecionado.nomeCompleto || "",
          email: clienteSelecionado.email || "",
          cpf: clienteSelecionado.cpf || "",
          documento: clienteSelecionado.cpf || "",
          celular:
            clienteSelecionado.celular ||
            clienteSelecionado.telefone ||
            "",
          telefone:
            clienteSelecionado.celular ||
            clienteSelecionado.telefone ||
            "",
        }}
        tokenFirebase={checkoutToken}
        gerarTokenCartao={null}
        onVoltar={() => setCheckoutAberto(false)}
        onSucesso={async (dados) => {
          // Este callback só deve ser chamado pelo Checkout depois que o backend
          // confirmar a criação da cobrança no Pagar.me. Não significa pagamento pago.
          console.info("Cobrança criada no Pagar.me:", dados);

          const clienteId = clienteSelecionado.id;
          const contratoId = clienteSelecionado.contratoAtual?.id;
          if (!clienteId || !contratoId) {
            throw new Error("Não foi possível identificar o cliente e o contrato para atualizar a pendência.");
          }

          const contratoRef = doc(db, "contratos", contratoId);
          const clienteRef = doc(db, "clientes", clienteId);
          const contratoAtual = clienteSelecionado.contratoAtual || {};
          const statusVendaAtual = obterStatusVenda(contratoAtual);
          const batch = writeBatch(db);
          const eventoRef = doc(collection(db, "historicoContratos", contratoId, "eventos"));
          const evento = {
            tipo: "cobranca_criada",
            descricao: "Cobrança criada no Pagar.me. Aguardando pagamento; a venda permanece com o status geral existente.",
            statusVenda: statusVendaAtual,
            statusPagamentoAnterior: contratoAtual.statusPagamento || "Não iniciado",
            statusPagamento: "Aguardando pagamento",
            pendenciaAnterior: contratoAtual.pendenciaCadastro || contratoAtual.pendenciaCadastroLabel || "NÃO TEM CONTRATO ASSINADO",
            pendenciaNova: "AGUARDANDO PAGAMENTO DO LINK",
            formaPagamento: dados?.formaPagamento || dados?.metodoPagamento || contratoAtual.formaPagamento || "",
            clienteId,
            contratoId,
            responsavelId: usuario?.uid || "",
            responsavelNome: usuario?.displayName || usuario?.nome || usuario?.email || "Usuário",
            criadoEm: serverTimestamp(),
            origem: "VendaCarteirinha/Checkout",
          };

          const atualizacao = {
            // Não inventa um status geral novo: mantém Ativo/Pendente/Em análise/Cancelado/Inativo.
            statusVenda: statusVendaAtual,
            statusVendaLabel: statusVendaAtual,
            status: statusVendaAtual,
            statusLabel: statusVendaAtual,
            pendenciaCadastro: "AGUARDANDO PAGAMENTO DO LINK",
            pendenciaCadastroLabel: "AGUARDANDO PAGAMENTO DO LINK",
            statusPagamento: "Aguardando pagamento",
            statusPagamentoLabel: "Aguardando pagamento",
            checkoutCriadoEm: serverTimestamp(),
            atualizadoEm: serverTimestamp(),
          };

          batch.update(contratoRef, atualizacao);
          batch.update(clienteRef, { ...atualizacao, contratoId });
          batch.set(eventoRef, evento);
          batch.set(doc(db, "clientes", clienteId, "historico", eventoRef.id), evento);
          batch.set(doc(db, "contratos", contratoId, "historico", eventoRef.id), evento);
          await batch.commit();

          // Mantém o checkout aberto para exibir QR, boleto ou instruções do cartão.
          await carregarClientes(true);
          setClienteSelecionado((atual) => atual ? ({
            ...atual,
            statusVenda: statusVendaAtual,
            statusVendaLabel: statusVendaAtual,
            pendenciaCadastro: "AGUARDANDO PAGAMENTO DO LINK",
            pendenciaCadastroLabel: "AGUARDANDO PAGAMENTO DO LINK",
            statusPagamento: "Aguardando pagamento",
            statusPagamentoLabel: "Aguardando pagamento",
            contratoAtual: {
              ...(atual.contratoAtual || contratoAtual),
              ...atualizacao,
            },
          }) : atual);
        }}
      />
    );
  }

  // ===================================================
  // TELA
  // ===================================================

  return (
    <main className="venda-carteirinha">

      {/* CABEÇALHO */}

      <header className="vc-cabecalho">
        <div>
          <h1>Venda de Carteirinha</h1>

          <p>
            Consulte clientes, inicie cadastros e acompanhe a
            emissão das carteirinhas.
          </p>
        </div>

        <button
          type="button"
          className="vc-atualizar"
          onClick={() => carregarClientes(true)}
          disabled={atualizando}
        >
          <RefreshCw
            size={16}
            className={atualizando ? "vc-girando" : ""}
          />
          Atualizar
        </button>
      </header>

      {/* ETAPAS */}

      <section className="vc-etapas">
        <article className="vc-etapa">
          <span>1</span>
          <div>
            <strong>Localizar cliente</strong>
            <small>Buscar ou cadastrar</small>
          </div>
        </article>

        <article className="vc-etapa">
          <span>2</span>
          <div>
            <strong>Pagamento</strong>
            <small>Checkout online</small>
          </div>
        </article>

        <article className="vc-etapa">
          <span>3</span>
          <div>
            <strong>Análise</strong>
            <small>Aprovação administrativa</small>
          </div>
        </article>

        <article className="vc-etapa">
          <span>4</span>
          <div>
            <strong>Carteirinha</strong>
            <small>Emissão após ativação</small>
          </div>
        </article>
      </section>

      {/* MENSAGEM DE ERRO */}

      {erro && (
        <div className="vc-alerta">
          <AlertCircle size={18} />
          {erro}
        </div>
      )}

      {/* INDICADORES */}

      <section
        className="vc-indicadores"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))",
          gap: 12,
          marginBottom: 18,
        }}
      >
        {[
          ["Leads do site", indicadores.leads],
          ["Oportunidades", indicadores.oportunidades],
          ["Contratos pendentes", indicadores.pendentes],
          ["Contratos ativos", indicadores.ativos],
        ].map(([titulo, total]) => (
          <article
            className="vc-indicador"
            key={titulo}
            style={{
              padding: "16px 18px",
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              background: "#fff",
              display: "flex",
              flexDirection: "column",
              gap: 7,
            }}
          >
            <span style={{ color: "#64748b", fontSize: 13 }}>
              {titulo}
            </span>

            <strong style={{ color: "#17345f", fontSize: 25 }}>
              {total}
            </strong>
          </article>
        ))}
      </section>

      {/* LEADS RECEBIDOS PELO SITE */}

      <section className="vc-painel">
        <div className="vc-titulo-secao">
          <div>
            <h2>Leads recebidos pelo site</h2>
            <p>
              Contatos interessados em contratar. Os dados aparecem
              conforme foram preenchidos no site.
            </p>
          </div>

          <span className="vc-status vc-status-pendente">
            {leadsFiltrados.length} disponíveis
          </span>
        </div>

        {carregando ? (
          <div className="vc-vazio">
            <RefreshCw size={22} className="vc-girando" />
            Carregando leads...
          </div>
        ) : leadsFiltrados.length ? (
          <div className="vc-lista-clientes">
            {leadsFiltrados.map((lead) => {
              const nome =
                lead.nome ||
                lead.nomeCompleto ||
                lead.name ||
                "Nome não informado";

              const telefone =
                lead.telefone ||
                lead.celular ||
                lead.whatsapp ||
                "";

              const email = lead.email || "";

              const cpf =
                lead.cpf ||
                lead.documento ||
                "";

              return (
                <article
                  className="vc-cliente-item vc-lead-item"
                  key={lead.id}
                  style={{
                    cursor: "default",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    width: "100%",
                    textAlign: "left",
                  }}
                >
                  <div className="vc-avatar">
                    <UserRound size={21} />
                  </div>

                  <div className="vc-cliente-info">
                    <strong>{nome}</strong>

                    {telefone && (
                      <small>Telefone: {telefone}</small>
                    )}

                    {email && (
                      <small>E-mail: {email}</small>
                    )}

                    {cpf && (
                      <small>CPF: {formatarCPF(cpf)}</small>
                    )}

                    {!telefone && !email && !cpf && (
                      <small>
                        O formulário não trouxe outros dados de contato.
                      </small>
                    )}

                    <small>
                      Recebido em:{" "}
                      {dataLegivel(
                        lead.criadoEm ||
                        lead.createdAt ||
                        lead.dataCriacao
                      )}
                    </small>
                  </div>

                  <button
                    type="button"
                    className="vc-novo-cliente"
                    onClick={() => iniciarNovoCadastro(lead)}
                  >
                    <UserPlus size={16} />
                    Vender carteirinha
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="vc-vazio">
            <UserRound size={26} />
            <strong>Nenhum lead disponível</strong>
            <span>
              Novos contatos enviados pelo site aparecerão aqui
              quando estiverem gravados na coleção leads.
            </span>
          </div>
        )}
      </section>

      {/* BUSCA */}

      <section className="vc-painel">
        <div className="vc-titulo-secao">
          <div>
            <h2>Localizar cliente</h2>
            <p>
              Pesquise clientes já cadastrados por nome, CPF,
              telefone ou e-mail.
            </p>
          </div>

          <button
            type="button"
            className="vc-novo-cliente"
            onClick={() => iniciarNovoCadastro()}
          >
            <UserPlus size={17} />
            Novo cadastro
          </button>
        </div>

        <label className="vc-busca">
          <Search size={19} />

          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Digite o nome, CPF, telefone ou e-mail..."
          />

          {busca && (
            <button
              type="button"
              onClick={() => setBusca("")}
              aria-label="Limpar busca"
            >
              <X size={17} />
            </button>
          )}
        </label>

        {/* RESULTADOS */}

        {carregando ? (
          <div className="vc-vazio">
            <RefreshCw size={22} className="vc-girando" />
            Carregando clientes...
          </div>
        ) : clientesFiltrados.length > 0 ? (
          <div className="vc-lista-clientes">
            {clientesFiltrados.map((cliente) => {
              const contrato = cliente.contratoAtual || {};

              const selecionado =
                clienteSelecionado?.id === cliente.id;

              return (
                <button
                  type="button"
                  key={cliente.id}
                  className={`vc-cliente-item ${
                    selecionado ? "selecionado" : ""
                  }`}
                  onClick={() => selecionarCliente(cliente)}
                >
                  <div className="vc-avatar">
                    <UserRound size={21} />
                  </div>

                  <div className="vc-cliente-info">
                    <strong>{cliente.nomeCompleto}</strong>
                    <small>
                      CPF: {formatarCPF(cliente.cpf)}
                    </small>

                    <small>
                      Telefone:{" "}
                      {cliente.celular ||
                        cliente.telefone ||
                        "Não informado"}
                    </small>

                    <small>
                      E-mail: {cliente.email || "Não informado"}
                    </small>

                    <span
                      className={`vc-status ${classeStatus(contrato)}`}
                    >
                      {obterStatusVenda(contrato)}
                    </span>
                    {contrato.id && (
                      <small>
                        Pendência: {contrato.pendenciaCadastro || contrato.pendenciaCadastroLabel || "NÃO TEM CONTRATO ASSINADO"}
                      </small>
                    )}
                  </div>

                  <ChevronRight size={20} />
                </button>
              );
            })}
          </div>
        ) : (
          <div className="vc-vazio">
            <Search size={26} />
            <strong>Nenhum cliente encontrado</strong>
            <span>
              Tente pesquisar por outro nome, CPF, telefone ou e-mail.
            </span>
          </div>
        )}
      </section>

      {/* CLIENTE SELECIONADO */}

      {clienteSelecionado && (
        <section className="vc-painel vc-detalhes">
          <div className="vc-titulo-secao">
            <div>
              <h2>Dados do cliente</h2>
              <p>
                Confira as informações antes de continuar a venda.
              </p>
            </div>

            <button
              type="button"
              className="vc-fechar"
              onClick={limparSelecao}
            >
              <X size={17} />
              Fechar
            </button>
          </div>

          {/* DADOS PESSOAIS */}

          <div className="vc-dados-cliente">
            <div>
              <small>Nome completo</small>
              <strong>
                {clienteSelecionado.nomeCompleto}
              </strong>
            </div>

            <div>
              <small>CPF</small>
              <strong>
                {formatarCPF(clienteSelecionado.cpf)}
              </strong>
            </div>

            <div>
              <small>Telefone</small>
              <strong>
                {clienteSelecionado.celular ||
                  clienteSelecionado.telefone ||
                  "Não informado"}
              </strong>
            </div>

            <div>
              <small>E-mail</small>
              <strong>
                {clienteSelecionado.email || "Não informado"}
              </strong>
            </div>
          </div>

          {/* CONTRATO */}

          <div className="vc-contrato-resumo">
            <h3>
              <FileText size={17} />
              Situação do contrato
            </h3>

            {contratoSelecionado ? (
              <>
                <div className="vc-resumo-grade">
                  <div>
                    <small>Plano</small>
                    <strong>
                      {contratoSelecionado.planoNome ||
                        "Não informado"}
                    </strong>
                  </div>

                  <div>
                    <small>Valor</small>
                    <strong>
                      {contratoSelecionado.valor != null
                        ? dinheiro(contratoSelecionado.valor)
                        : contratoSelecionado.valorTotal != null
                        ? dinheiro(contratoSelecionado.valorTotal)
                        : "Não informado"}
                    </strong>
                  </div>

                  <div>
                    <small>Forma de pagamento</small>
                    <strong>
                      {contratoSelecionado.formaPagamento ||
                        contratoSelecionado.metodoPagamento ||
                        "Não informada"}
                    </strong>
                  </div>

                  <div>
                    <small>Status</small>
                    <span
                      className={`vc-status ${classeStatus(
                        contratoSelecionado
                      )}`}
                    >
                      {contratoSelecionado.statusLabel ||
                        contratoSelecionado.status ||
                        "Sem status"}
                    </span>
                  </div>
                  <div>
                    <small>Pendência do contrato</small>
                    <strong>
                      {contratoSelecionado.pendenciaCadastro || contratoSelecionado.pendenciaCadastroLabel || "NÃO TEM CONTRATO ASSINADO"}
                    </strong>
                  </div>
                  <div>
                    <small>Status do pagamento</small>
                    <strong>
                      {contratoSelecionado.statusPagamentoLabel || contratoSelecionado.statusPagamento || "Não iniciado"}
                    </strong>
                  </div>
                </div>

                <label className="vc-seletor-plano" style={{ display: "block", marginTop: 14 }}>
                  <span style={{ display: "block", marginBottom: 6 }}>Atualizar pendência operacional</span>
                  <select
                    value={contratoSelecionado.pendenciaCadastro || contratoSelecionado.pendenciaCadastroLabel || "NÃO TEM CONTRATO ASSINADO"}
                    onChange={(e) => atualizarPendenciaContrato(e.target.value)}
                    disabled={salvandoPendencia}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: 8 }}
                  >
                    {PENDENCIAS_CONTRATO.map((pendencia) => (
                      <option key={pendencia} value={pendencia}>{pendencia}</option>
                    ))}
                  </select>
                  {salvandoPendencia && <small>Salvando pendência...</small>}
                </label>

                {carregandoHistorico && (
                  <div className="vc-alerta vc-alerta-status">
                    <Clock3 size={18} />
                    Consultando o histórico do contrato para identificar a origem da venda...
                  </div>
                )}

                {!clienteAtivo && (
                  <div className="vc-alerta vc-alerta-status">
                    <Clock3 size={18} />
                    Este cliente ainda não está ativo. A carteirinha não pode ser emitida.
                  </div>
                )}

                {clienteAtivo && !carregandoHistorico && !origemLiberada && (
                  <div className="vc-alerta vc-alerta-status">
                    <AlertCircle size={18} />
                    Contrato ativo, mas não identificamos pagamento confirmado no Pagar.me nem ativação administrativa de uma venda ENEL no histórico.
                  </div>
                )}

                {clienteAtivo && !dataAtivacao && (
                  <div className="vc-alerta vc-alerta-status">
                    <AlertCircle size={18} />
                    O contrato está ativo, mas não encontramos
                    a data de ativação necessária para a
                    carteirinha.
                  </div>
                )}
              </>
            ) : (
              <div className="vc-alerta vc-alerta-status">
                <AlertCircle size={18} />
                Este cliente ainda não possui contrato vinculado.
              </div>
            )}
          </div>

          {/* PLANO E PAGAMENTO */}

          <div className="vc-pagamento">
            <h3>Plano da contratação</h3>

            <label
              className="vc-seletor-plano"
              style={{ display: "block", marginBottom: 16 }}
            >
              <span style={{ display: "block", marginBottom: 6 }}>
                Selecione o plano
              </span>

              <select
                value={planoSelecionadoId}
                onChange={(evento) =>
                  setPlanoSelecionadoId(evento.target.value)
                }
                style={{
                  width: "100%",
                  minHeight: 44,
                  padding: "10px 12px",
                  borderRadius: 8,
                }}
              >
                <option value="">Selecione um plano...</option>

                {planos.map((plano) => (
                  <option key={plano.id} value={plano.id}>
                    {plano.nome || plano.titulo || "Plano"} —{" "}
                    {plano.valorMensal != null
                      ? dinheiro(plano.valorMensal)
                      : plano.valor != null
                      ? dinheiro(plano.valor)
                      : plano.preco != null
                      ? dinheiro(plano.preco)
                      : "Consulte valores"}
                  </option>
                ))}
              </select>
            </label>

            <h3>Forma de pagamento</h3>

            <div className="vc-opcoes-pagamento">
              <button
                type="button"
                className={
                  formaPagamento === "cartao"
                    ? "vc-opcao-pagamento ativo"
                    : "vc-opcao-pagamento"
                }
                onClick={() => setFormaPagamento("cartao")}
              >
                <CreditCard size={23} />
                <strong>Pagamento online</strong>
                <small>PIX, cartão ou boleto</small>
              </button>

              <button
                type="button"
                className={
                  formaPagamento === "enel"
                    ? "vc-opcao-pagamento ativo"
                    : "vc-opcao-pagamento"
                }
                onClick={() => setFormaPagamento("enel")}
              >
                <Zap size={23} />
                <strong>Outros pagamentos</strong>
                <small>Complete o cadastro</small>
              </button>
            </div>

            <button
              type="button"
              className="vc-continuar"
              onClick={continuarVenda}
              disabled={carregandoCheckout}
            >
              {formaPagamento === "cartao" ? (
                <>
                  <CreditCard size={18} />
                  {carregandoCheckout
                    ? "Preparando checkout..."
                    : "Continuar para pagamento"}
                </>
              ) : (
                <>
                  <Zap size={18} />
                  Continuar cadastro
                </>
              )}
            </button>
          </div>

          {/* EMISSÃO DA CARTEIRINHA */}

          {ehAdmin && (
            <div className="vc-emissao">
              <div>
                <h3>
                  <IdCard size={19} />
                  Emissão da carteirinha
                </h3>

                <p>
                  A emissão só é liberada para clientes com
                  contrato ativo e data de ativação registrada.
                </p>
              </div>

              <button
                type="button"
                className="vc-gerar"
                onClick={gerarCarteirinha}
                disabled={!podeGerarCarteirinha}
              >
                <IdCard size={18} />
                {carregandoHistorico ? "Verificando histórico..." : "Gerar carteirinha"}
              </button>
            </div>
          )}
        </section>
      )}

      {/* PRÉVIA DA CARTEIRINHA */}

      {abrirPreview && clienteSelecionado && (
        <div
          className="vc-modal-fundo"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setAbrirPreview(false);
            }
          }}
        >
          <section className="vc-modal">
            <header>
              <div>
                <h2>Carteirinha do cliente</h2>
                <p>Confira os dados antes de imprimir.</p>
              </div>

              <button
                type="button"
                onClick={() => setAbrirPreview(false)}
                aria-label="Fechar"
              >
                <X size={20} />
              </button>
            </header>

            <div className="vc-carteirinha-preview">
              <div className="vc-marca">
                DOUTOR SAÙDE FAMILIAR
              </div>

              <div className="vc-campo-cartao">
                <small>NOME COMPLETO</small>
                <strong>
                  {clienteSelecionado.nomeCompleto}
                </strong>
              </div>

              <div className="vc-campo-cartao">
                <small>CPF</small>
                <strong>
                  {formatarCPF(clienteSelecionado.cpf)}
                </strong>
              </div>

              <div className="vc-campo-cartao">
                <small>DATA DE ATIVAÇÃO</small>
                <strong>
                  {dataLegivel(dataAtivacao)}
                </strong>
              </div>

              <div className="vc-rodape-cartao">
                Carteirinha de identificação do beneficiário
              </div>
            </div>

            <div className="vc-modal-acoes">
              <button
                type="button"
                className="vc-imprimir"
                onClick={imprimirCarteirinha}
              >
                <Printer size={17} />
                Imprimir / Salvar PDF
              </button>

              <button
                type="button"
                className="vc-whatsapp"
                onClick={abrirWhatsApp}
                disabled={!telefoneCliente}
              >
                <MessageCircle size={17} />
                Abrir WhatsApp
              </button>
            </div>

            <div className="vc-observacao">
              <AlertCircle size={16} />
              A impressão permite salvar o documento em PDF.
              O envio automático do arquivo pelo WhatsApp
              dependerá da integração com a API oficial do
              WhatsApp Business.
            </div>
          </section>
        </div>
      )}
    </main>
  );
}