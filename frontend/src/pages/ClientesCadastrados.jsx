
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  collection,
  getDocs,
  getDoc,
  onSnapshot,
  doc,
  query,
  where,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";

import {
  Search,
  RefreshCw,
  Eye,
  X,
  Users,
  FileText,
  Clock3,
  AlertCircle,
  Pencil,
  SlidersHorizontal,
  Check,
} from "lucide-react";

import { db } from "../config/firebase";
import "./ClientesCadastrados.css";

// ===================================================
// STATUS OFICIAIS DO CONTRATO
// ===================================================

const STATUS_CONTRATO = [
  "Ativo",
  "Pendente",
  "Em análise",
  "Cancelado",
  "Inativo",
];

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
    : data.toLocaleString("pt-BR");
}

function dinheiro(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function normalizarStatus(status) {
  return String(status || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function obterStatusVenda(item = {}) {
  return item.statusVendaLabel || item.statusVenda || item.statusLabel || item.status || "Pendente";
}

function obterStatusPagamento(item = {}) {
  return item.statusPagamentoLabel || item.statusPagamento || "Não iniciado";
}

function obterPendenciaCadastro(item = {}) {
  return item.pendenciaCadastroLabel || item.pendenciaCadastro || "NÃO TEM CONTRATO ASSINADO";
}

function statusClasse(status) {
  const texto = normalizarStatus(status);

  if (texto === "ativo") {
    return "cc-status-ativo";
  }

  if (texto === "cancelado") {
    return "cc-status-cancelado";
  }

  if (
    texto === "pendente" ||
    texto === "em analise" ||
    texto === "analise de credito"
  ) {
    return "cc-status-pendente";
  }

  return "cc-status-neutro";
}

// ===================================================
// COMPONENTE PRINCIPAL
// ===================================================

export default function ClientesCadastrados({
  usuario,
  onNavigate,
}) {
  const [clientes, setClientes] = useState([]);
  const [contratos, setContratos] = useState([]);

  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);

  const [erro, setErro] = useState("");

  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("todos");

  const [selecionado, setSelecionado] = useState(null);

  const [historico, setHistorico] = useState([]);
  const [carregandoHistorico, setCarregandoHistorico] =
    useState(false);

  // Permissão do usuário
  const [ehAdmin, setEhAdmin] = useState(false);

  // Controle da janela de mudança de status
  const [modalStatus, setModalStatus] = useState(false);
  const [novoStatus, setNovoStatus] = useState("");
  const [salvandoStatus, setSalvandoStatus] = useState(false);
  const [erroStatus, setErroStatus] = useState("");

  // ===================================================
  // CARREGAR CLIENTES E CONTRATOS
  // ===================================================

  const carregarDados = useCallback(
    async (silencioso = false) => {
      if (!usuario?.uid) {
        setClientes([]);
        setContratos([]);
        setEhAdmin(false);
        setCarregando(false);

        setErro(
          "Não foi possível identificar o usuário conectado."
        );

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

        const clientesRef = collection(db, "clientes");
        const contratosRef = collection(db, "contratos");

        let clientesSnap;
        let contratosSnap;

        if (administrador) {
          [clientesSnap, contratosSnap] = await Promise.all([
            getDocs(clientesRef),
            getDocs(contratosRef),
          ]);
        } else {
          const [
            contratosDoVendedor,
            clientesDoVendedor,
          ] = await Promise.all([
            getDocs(
              query(
                contratosRef,
                where("vendedorId", "==", usuario.uid)
              )
            ),

            getDocs(
              query(
                clientesRef,
                where("criadoPor", "==", usuario.uid)
              )
            ),
          ]);

          contratosSnap = contratosDoVendedor;

          const ids = new Set([
            ...contratosDoVendedor.docs
              .map((item) => item.data().clienteId)
              .filter(Boolean),

            ...clientesDoVendedor.docs.map(
              (item) => item.id
            ),
          ]);

          const documentosClientes = await Promise.all(
            [...ids].map((id) =>
              getDoc(doc(db, "clientes", id))
            )
          );

          clientesSnap = {
            docs: documentosClientes.filter((item) =>
              item.exists()
            ),
          };
        }

        console.info("Clientes cadastrados carregados:", {
          usuarioId: usuario.uid,
          administrador,
          totalClientes: clientesSnap.docs.length,
          totalContratos: contratosSnap.docs.length,
        });

        const listaContratos = contratosSnap.docs.map(
          (item) => ({
            id: item.id,
            ...item.data(),
          })
        );

        const listaClientes = clientesSnap.docs.map(
          (item) => ({
            id: item.id,
            ...item.data(),
          })
        );

        const contratosPorCliente = new Map();

        listaContratos.forEach((contrato) => {
          const id = contrato.clienteId;

          if (!id) return;

          const atual = contratosPorCliente.get(id) || [];

          atual.push(contrato);

          contratosPorCliente.set(id, atual);
        });

        const unidos = listaClientes.map((cliente) => {
          const lista = (
            contratosPorCliente.get(cliente.id) || []
          ).sort(
            (a, b) =>
              dataValor(b.criadoEm || b.atualizadoEm) -
              dataValor(a.criadoEm || a.atualizadoEm)
          );

          return {
            ...cliente,
            contratos: lista,
            // Um cliente deve possuir exatamente um contrato.
            // Em caso de duplicidade, não selecionar um contrato arbitrariamente.
            contratoAtual: lista.length === 1 ? lista[0] : null,
            possuiMultiplosContratos: lista.length > 1,
          };
        });

        unidos.sort(
          (a, b) =>
            dataValor(
              b.criadoEm ||
                b.atualizadoEm ||
                b.contratoAtual?.criadoEm
            ) -
            dataValor(
              a.criadoEm ||
                a.atualizadoEm ||
                a.contratoAtual?.criadoEm
            )
        );

        setClientes(unidos);
        setContratos(listaContratos);
      } catch (error) {
        console.error(
          "Erro ao carregar clientes cadastrados:",
          error
        );

        setErro(
          error.code === "permission-denied"
            ? "O Firebase bloqueou a consulta. Verifique as regras do Firestore para clientes e contratos."
            : `Falha ao consultar o Firebase: ${
                error.message || "erro desconhecido"
              }`
        );
      } finally {
        setCarregando(false);
        setAtualizando(false);
      }
    },
    [usuario]
  );

  useEffect(() => {
    carregarDados();
  }, [carregarDados]);

  // Mantém clientes e contratos sincronizados em tempo real com o Firestore.
  // A consulta respeita o mesmo escopo de acesso usado no carregamento inicial.
  useEffect(() => {
    if (!usuario?.uid) return undefined;

    let cancelado = false;
    let cancelarClientes;
    let cancelarContratos;

    async function iniciarSincronizacao() {
      try {
        let claims = usuario.customClaims || {};
        if (typeof usuario.getIdTokenResult === "function") {
          const tokenResult = await usuario.getIdTokenResult(true);
          claims = tokenResult?.claims || claims;
        }

        if (cancelado) return;

        const perfil = String(
          usuario.role ||
            usuario.perfil ||
            usuario.tipoUsuario ||
            claims.role ||
            claims.perfil ||
            ""
        ).toLowerCase();

        const administrador =
          ["admin", "administrador", "administracao"].includes(perfil) ||
          claims.admin === true ||
          claims.administrador === true;

        const clientesRef = collection(db, "clientes");
        const contratosRef = collection(db, "contratos");

        const aoAlterar = () => {
          if (!cancelado) carregarDados(true);
        };

        const aoFalhar = (error) => {
          console.error("Erro na sincronização em tempo real:", error);
          if (!cancelado) {
            setErro(
              error.code === "permission-denied"
                ? "Sem permissão para acompanhar as atualizações em tempo real do Firestore."
                : `Falha na sincronização: ${error.message || "erro desconhecido"}`
            );
          }
        };

        if (administrador) {
          cancelarClientes = onSnapshot(clientesRef, aoAlterar, aoFalhar);
          cancelarContratos = onSnapshot(contratosRef, aoAlterar, aoFalhar);
        } else {
          cancelarClientes = onSnapshot(
            query(clientesRef, where("criadoPor", "==", usuario.uid)),
            aoAlterar,
            aoFalhar
          );
          cancelarContratos = onSnapshot(
            query(contratosRef, where("vendedorId", "==", usuario.uid)),
            aoAlterar,
            aoFalhar
          );
        }
      } catch (error) {
        console.error("Não foi possível iniciar a sincronização:", error);
        if (!cancelado) {
          setErro(`Falha ao iniciar sincronização: ${error.message || "erro desconhecido"}`);
        }
      }
    }

    iniciarSincronizacao();

    return () => {
      cancelado = true;
      cancelarClientes?.();
      cancelarContratos?.();
    };
  }, [usuario, carregarDados]);

  // ===================================================
  // FILTROS
  // ===================================================

  const clientesFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return clientes.filter((cliente) => {
      const contrato = cliente.contratoAtual || {};

      const correspondeBusca =
        !termo ||
        [
          cliente.nomeCompleto,
          cliente.email,
          cliente.cidade,
          cliente.celular,
          cliente.telefone,
          contrato.planoNome,
          contrato.vendedorNome,
          formatarCPF(cliente.cpf),
        ].some((valor) =>
          String(valor || "")
            .toLowerCase()
            .includes(termo)
        );

      const status = normalizarStatus(obterStatusVenda(contrato));

      const correspondeStatus =
        filtroStatus === "todos" ||
        (filtroStatus === "sem_contrato"
          ? !cliente.contratos.length
          : filtroStatus === "multiplos_contratos"
            ? cliente.contratos.length > 1
            : status === normalizarStatus(filtroStatus));

      return correspondeBusca && correspondeStatus;
    });
  }, [clientes, busca, filtroStatus]);

  // ===================================================
  // EDITAR CLIENTE
  // ===================================================

  function editarCliente(cliente) {
    if (!cliente?.id) {
      alert("Não foi possível identificar o cliente.");
      return;
    }

    if ((cliente.contratos || []).length > 1) {
      alert("Este cliente possui mais de um contrato vinculado. Corrija a duplicidade antes de editar. Nenhum contrato foi selecionado automaticamente.");
      return;
    }

    const contrato = cliente.contratoAtual;

    if (!contrato?.id) {
      alert(
        "Este cliente ainda não possui um contrato vinculado. Não é possível abrir a edição por esta tela."
      );

      return;
    }

    try {
      sessionStorage.setItem(
        "clienteParaEditar",
        JSON.stringify({
          clienteId: cliente.id,
          contratoId: contrato.id,
        })
      );

      setSelecionado(null);

      if (onNavigate) {
        onNavigate("/clientes/novo");
      } else {
        window.location.href = "/clientes/novo";
      }
    } catch (error) {
      console.error("Erro ao abrir edição:", error);

      alert(
        "Não foi possível iniciar a edição deste cliente."
      );
    }
  }

  // ===================================================
  // ABRIR DETALHES DO CLIENTE
  // ===================================================

  async function abrirDetalhes(cliente) {
    setSelecionado(cliente);
    setHistorico([]);

    const listaContratos = cliente.contratos || [];

    setCarregandoHistorico(true);

    try {
      // Histórico central por contrato + históricos legados para manter a transição.
      const [historicoClienteSnap, historicosContratos, historicosCentrais] = await Promise.all([
        getDocs(collection(db, "clientes", cliente.id, "historico")),
        Promise.all(
          listaContratos.map((contrato) =>
            getDocs(collection(db, "contratos", contrato.id, "historico"))
          )
        ),
        Promise.all(
          listaContratos.map((contrato) =>
            getDocs(collection(db, "historicoContratos", contrato.id, "eventos"))
          )
        ),
      ]);

      const itensCliente = historicoClienteSnap.docs.map((documento) => {
        const dados = documento.data();
        return {
          id: documento.id,
          grupo: "Histórico do cliente",
          origemHistorico: "cliente",
          ...dados,
          eventoId: dados.eventoId || documento.id,
          contratoId:
            dados.contratoId ||
            (listaContratos.length === 1 ? listaContratos[0].id : undefined),
        };
      });

      const itensContratos = historicosContratos.flatMap((snap, indice) =>
        snap.docs.map((documento) => ({
          id: documento.id,
          grupo: "Histórico do contrato",
          origemHistorico: "contrato",
          ...documento.data(),
          contratoId: documento.data().contratoId || listaContratos[indice].id,
        }))
      );

      const itensCentrais = historicosCentrais.flatMap((snap, indice) =>
        snap.docs.map((documento) => ({
          id: documento.id,
          grupo: "Histórico",
          origemHistorico: "central",
          ...documento.data(),
          eventoId: documento.data().eventoId || documento.id,
          contratoId: documento.data().contratoId || listaContratos[indice].id,
        }))
      );

      // Prioriza o evento central e preserva registros que só existem nos caminhos antigos.
      const unicos = new Map();
      [...itensContratos, ...itensCliente, ...itensCentrais].forEach((item) => {
        const chave = item.eventoId || `${item.contratoId || ""}:${item.id}`;
        if (!unicos.has(chave) || item.origemHistorico === "central") {
          unicos.set(chave, item);
        }
      });

      let itensComplementares = [];
      // Dependentes, cobranças e notificações só são associados automaticamente
      // quando existe um único contrato.
      if (listaContratos.length === 1) {
        const contratoIdUnico = listaContratos[0].id;
        const [dependentesSnap, cobrancasSnap, notificacoesSnap] = await Promise.all([
          getDocs(collection(db, "contratos", contratoIdUnico, "dependentes")),
          getDocs(collection(db, "contratos", contratoIdUnico, "cobrancas")),
          getDocs(collection(db, "contratos", contratoIdUnico, "notificacoes")),
        ]);

        const itensDependentes = dependentesSnap.docs.map((documento) => {
          const dados = documento.data();
          return {
            id: documento.id,
            grupo: "Dependente",
            tipo: "dependente",
            descricao: `Dependente: ${dados.nome || "Cadastro"}`,
            criadoEm: dados.criadoEm,
          };
        });

        const itensCobrancas = cobrancasSnap.docs.map((documento) => {
          const dados = documento.data();
          return {
            id: documento.id,
            grupo: "Cobrança",
            tipo: "cobranca",
            descricao: `${dinheiro(dados.valor)} · ${dados.formaPagamento || "—"} · ${dados.status || "—"}`,
            criadoEm: dados.criadoEm,
          };
        });

        const itensNotificacoes = notificacoesSnap.docs.map((documento) => {
          const dados = documento.data();
          return {
            id: documento.id,
            grupo: "Notificação",
            tipo: "notificacao",
            descricao: dados.assunto || "Notificação registrada",
            criadoEm: dados.criadoEm,
          };
        });

        itensComplementares = [
          ...itensDependentes,
          ...itensCobrancas,
          ...itensNotificacoes,
        ];
      }

      setHistorico([...unicos.values(), ...itensComplementares].sort(
        (a, b) => dataValor(b.criadoEm) - dataValor(a.criadoEm)
      ));
    } catch (error) {
      console.error("Erro ao carregar detalhes do cliente:", error);
      setHistorico([]);
    } finally {
      setCarregandoHistorico(false);
    }
  }

  // ABRIR JANELA DE MUDANÇA DE STATUS
  // ===================================================

  function abrirModalStatus() {
    if (!ehAdmin) {
      alert(
        "Somente administradores podem alterar o status do contrato."
      );
      return;
    }

    if ((selecionado?.contratos || []).length > 1) {
      alert("Este cliente possui mais de um contrato vinculado. Corrija a duplicidade antes de alterar o status.");
      return;
    }

    const contrato = selecionado?.contratoAtual;

    if (!contrato?.id) {
      alert("Este cliente não possui contrato único vinculado.");
      return;
    }

    setNovoStatus(
      contrato.statusVendaLabel ||
        contrato.statusVenda ||
        contrato.statusLabel ||
        contrato.status ||
        "Pendente"
    );

    setErroStatus("");
    setModalStatus(true);
  }

  // ===================================================
  // SALVAR NOVO STATUS
  // ===================================================

  async function salvarNovoStatus() {
    if (!ehAdmin) {
      setErroStatus(
        "Somente administradores podem realizar esta alteração."
      );
      return;
    }

    if ((selecionado?.contratos || []).length > 1) {
      setErroStatus("Este cliente possui mais de um contrato vinculado. Corrija a duplicidade antes de alterar o status.");
      return;
    }

    const contrato = selecionado?.contratoAtual;

    if (!contrato?.id) {
      setErroStatus("Contrato único não identificado.");
      return;
    }

    if (!STATUS_CONTRATO.includes(novoStatus)) {
      setErroStatus("Selecione um status válido.");
      return;
    }

    const statusAnterior =
      contrato.statusVendaLabel ||
      contrato.statusVenda ||
      contrato.statusLabel ||
      contrato.status ||
      "Não informado";

    if (normalizarStatus(statusAnterior) === normalizarStatus(novoStatus)) {
      setErroStatus(
        "O cliente já está com esse status."
      );
      return;
    }

    setSalvandoStatus(true);
    setErroStatus("");

    try {
      const contratoRef = doc(
        db,
        "contratos",
        contrato.id
      );

      // Status de venda é independente da pendência operacional e do pagamento.
      // Não alterar statusPagamento nem pendenciaCadastro nesta ação manual.
      const agora = serverTimestamp();
      const nomeUsuario =
        usuario.displayName ||
        usuario.nome ||
        usuario.email ||
        "Administrador";

      const dadosStatus = {
        statusVenda: novoStatus,
        statusVendaLabel: novoStatus,
        // Mantém os campos antigos sincronizados para telas legadas.
        status: novoStatus,
        statusLabel: novoStatus,
        atualizadoEm: agora,
        statusAlteradoPor: usuario.uid,
        statusAlteradoPorNome: nomeUsuario,
        statusAlteradoEm: agora,
      };

      const eventoHistoricoRef = doc(
        collection(db, "historicoContratos", contrato.id, "eventos")
      );
      const eventoHistorico = {
        eventoId: eventoHistoricoRef.id,
        clienteId: selecionado.id,
        contratoId: contrato.id,
        tipo: "alteracao_status_venda",
        grupo: "Histórico",
        descricao: `Status da venda alterado de "${statusAnterior}" para "${novoStatus}".`,
        statusAnterior,
        statusNovo: novoStatus,
        usuarioId: usuario.uid,
        usuarioNome: nomeUsuario,
        origem: "clientes_cadastrados",
        criadoEm: agora,
      };

      const batch = writeBatch(db);
      batch.update(contratoRef, dadosStatus);
      batch.update(doc(db, "clientes", selecionado.id), dadosStatus);
      batch.set(eventoHistoricoRef, eventoHistorico);
      batch.set(
        doc(db, "clientes", selecionado.id, "historico", eventoHistoricoRef.id),
        eventoHistorico
      );
      batch.set(
        doc(db, "contratos", contrato.id, "historico", eventoHistoricoRef.id),
        eventoHistorico
      );
      await batch.commit();

      // Atualiza os dados na tela sem precisar sair
      const contratoAtualizado = {
        ...contrato,
        statusVenda: novoStatus,
        statusVendaLabel: novoStatus,
        status: novoStatus,
        statusLabel: novoStatus,
      };

      const clienteAtualizado = {
        ...selecionado,
        contratoAtual: contratoAtualizado,
        contratos: (selecionado.contratos || []).map(
          (item) =>
            item.id === contrato.id
              ? contratoAtualizado
              : item
        ),
      };

      setSelecionado(clienteAtualizado);

      setClientes((anteriores) =>
        anteriores.map((cliente) =>
          cliente.id === selecionado.id
            ? clienteAtualizado
            : cliente
        )
      );

      setContratos((anteriores) =>
        anteriores.map((item) =>
          item.id === contrato.id
            ? contratoAtualizado
            : item
        )
      );

      setModalStatus(false);

      // Atualiza o histórico exibido no modal
      setHistorico((anteriores) => [
        {
          id: `status-${Date.now()}`,
          grupo: "Histórico",
          tipo: "alteracao_status",
          descricao: `Status da venda alterado de "${statusAnterior}" para "${novoStatus}".`,
          usuarioNome:
            usuario.displayName ||
            usuario.nome ||
            usuario.email ||
            "Administrador",
          criadoEm: new Date(),
        },
        ...anteriores,
      ]);
    } catch (error) {
      console.error("Erro ao alterar status:", error);

      setErroStatus(
        error.code === "permission-denied"
          ? "O Firebase bloqueou a alteração. Verifique as permissões do administrador nas regras do Firestore."
          : `Não foi possível alterar o status: ${
              error.message || "erro desconhecido"
            }`
      );
    } finally {
      setSalvandoStatus(false);
    }
  }

  // ===================================================
  // INDICADORES
  // ===================================================

  const totalAtivos = clientes.filter(
    (item) =>
      normalizarStatus(obterStatusVenda(item.contratoAtual)) === "ativo"
  ).length;

  const totalPendentes = clientes.filter((item) => {
    const status = normalizarStatus(obterStatusVenda(item.contratoAtual));

    return [
      "em analise",
      "pendente",
    ].includes(status);
  }).length;

  // ===================================================
  // TELA
  // ===================================================

  return (
    <main className="clientes-cadastrados">

      {/* CABEÇALHO */}

      <header className="cc-cabecalho">
        <div>
          <h1>Clientes Cadastrados</h1>

          <div className="cc-breadcrumb">
            <button
              type="button"
              onClick={() => onNavigate?.("/painel")}
            >
              Painel
            </button>

            <span>/</span>

            <strong>Clientes Cadastrados</strong>
          </div>
        </div>

        <button
          className="cc-atualizar"
          type="button"
          onClick={() => carregarDados(true)}
          disabled={atualizando}
        >
          <RefreshCw
            size={15}
            className={atualizando ? "cc-girando" : ""}
          />

          Atualizar
        </button>
      </header>

      {/* INDICADORES */}

      <section className="cc-indicadores">
        <article>
          <span>Total de clientes</span>
          <strong>{clientes.length}</strong>
          <Users size={22} />
        </article>

        <article>
          <span>Com contrato ativo</span>
          <strong>{totalAtivos}</strong>
          <FileText size={22} />
        </article>

        <article>
          <span>Em análise / pendentes</span>
          <strong>{totalPendentes}</strong>
          <Clock3 size={22} />
        </article>

        <article>
          <span>Aguardando pagamento</span>
          <strong>
            {clientes.filter((item) =>
              ["aguardando pagamento", "pendente", "nao iniciado"].includes(
                normalizarStatus(obterStatusPagamento(item.contratoAtual))
              )
            ).length}
          </strong>
          <Clock3 size={22} />
        </article>

        <article>
          <span>Pagamento confirmado</span>
          <strong>
            {clientes.filter((item) =>
              ["pago", "paid", "recebido", "confirmado"].includes(
                normalizarStatus(obterStatusPagamento(item.contratoAtual))
              )
            ).length}
          </strong>
          <Check size={22} />
        </article>
      </section>

      {/* PAINEL PRINCIPAL */}

      <section className="cc-painel">

        {/* FILTROS */}

        <div className="cc-filtros">
          <label className="cc-busca">
            <Search size={17} />

            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, CPF, telefone, e-mail, plano ou vendedor..."
            />
          </label>

          <select
            value={filtroStatus}
            onChange={(e) =>
              setFiltroStatus(e.target.value)
            }
            aria-label="Filtrar por status"
          >
            <option value="todos">Todos os status</option>

            {STATUS_CONTRATO.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}

            <option value="sem_contrato">
              Sem contrato localizado
            </option>
            <option value="multiplos_contratos">
              Clientes com contratos duplicados
            </option>
          </select>
        </div>

        {/* ERROS */}

        {erro && (
          <div className="cc-alerta">
            <AlertCircle size={17} />
            {erro}
          </div>
        )}

        {/* CARREGAMENTO E RESULTADOS */}

        {carregando ? (
          <div className="cc-vazio">
            Carregando clientes...
          </div>
        ) : clientesFiltrados.length === 0 ? (
          <div className="cc-vazio">
            <Users size={28} />

            <strong>Nenhum cliente encontrado</strong>

            <span>
              Altere os filtros ou cadastre um novo cliente.
            </span>
          </div>
        ) : (
          <div className="cc-tabela-wrap">
            <table className="cc-tabela">

              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>CPF</th>
                  <th>Contato</th>
                  <th>Plano / Contrato</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th>Cadastro</th>
                  <th>Ações</th>
                </tr>
              </thead>

              <tbody>
                {clientesFiltrados.map((cliente) => {
                  const contrato =
                    cliente.contratoAtual || {};

                  const status =
                    cliente.possuiMultiplosContratos
                      ? "Múltiplos contratos — revisar"
                      : obterStatusVenda(contrato);

                  return (
                    <tr key={cliente.id}>

                      <td>
                        <strong>
                          {cliente.nomeCompleto ||
                            "Nome não informado"}
                        </strong>

                        <small>
                          {cliente.cidade ||
                            "Cidade não informada"}

                          {cliente.estado
                            ? ` - ${cliente.estado}`
                            : ""}
                        </small>
                      </td>

                      <td>
                        {formatarCPF(cliente.cpf)}
                      </td>

                      <td>
                        <span>
                          {cliente.celular ||
                            cliente.telefone ||
                            "—"}
                        </span>

                        <small>
                          {cliente.email || "Sem e-mail"}
                        </small>
                      </td>

                      <td>
                        <strong>
                          {contrato.planoNome ||
                            "Não definido"}
                        </strong>

                        <small>
                          {contrato.formaPagamento ||
                            "Forma de pagamento não definida"}
                        </small>
                      </td>

                      <td>
                        {contrato.valor != null
                          ? dinheiro(contrato.valor)
                          : "—"}
                      </td>

                      <td>
                        <span
                          className={`cc-status ${statusClasse(
                            status
                          )}`}
                        >
                          {status}
                        </span>
                        {!cliente.possuiMultiplosContratos && (
                          <small className="cc-status-detalhe">
                            Pagamento: {obterStatusPagamento(contrato)}
                          </small>
                        )}
                        {!cliente.possuiMultiplosContratos && (
                          <small className="cc-status-detalhe">
                            Pendência: {obterPendenciaCadastro(contrato)}
                          </small>
                        )}
                      </td>

                      <td>
                        {dataLegivel(
                          cliente.criadoEm ||
                            contrato.criadoEm
                        )}
                      </td>

                      <td>
                        <div className="cc-acoes">

                          <button
                            className="cc-ver"
                            type="button"
                            onClick={() =>
                              abrirDetalhes(cliente)
                            }
                          >
                            <Eye size={15} />
                            Detalhes
                          </button>

                          <button
                            className="cc-editar"
                            type="button"
                            onClick={() =>
                              editarCliente(cliente)
                            }
                            disabled={!contrato.id}
                            title={
                              contrato.id
                                ? "Editar cliente"
                                : "Cliente sem contrato vinculado"
                            }
                          >
                            <Pencil size={15} />
                            Editar
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

        {/* RODAPÉ */}

        <footer className="cc-rodape">
          Exibindo {clientesFiltrados.length} de{" "}
          {clientes.length} cliente(s) ·{" "}
          {contratos.length} contrato(s) carregado(s)
        </footer>
      </section>

      {/* ===================================================
          MODAL DE DETALHES
      =================================================== */}

      {selecionado && (
        <div
          className="cc-modal-fundo"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setSelecionado(null);
            }
          }}
        >
          <section
            className="cc-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cc-modal-titulo"
          >

            {/* CABEÇALHO DO MODAL */}

            <header>
              <div>
                <h2 id="cc-modal-titulo">
                  Detalhes do cliente
                </h2>

                <span>
                  {selecionado.nomeCompleto}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setSelecionado(null)}
                aria-label="Fechar"
              >
                <X size={20} />
              </button>
            </header>

            {/* DADOS DO CLIENTE */}

            <div className="cc-detalhes-grade">
              <div>
                <small>CPF</small>
                <strong>
                  {formatarCPF(selecionado.cpf)}
                </strong>
              </div>

              <div>
                <small>Data de nascimento</small>
                <strong>
                  {selecionado.dataNascimento || "—"}
                </strong>
              </div>

              <div>
                <small>Telefone / celular</small>
                <strong>
                  {selecionado.celular ||
                    selecionado.telefone ||
                    "—"}
                </strong>
              </div>

              <div>
                <small>E-mail</small>
                <strong>
                  {selecionado.email || "—"}
                </strong>
              </div>

              <div>
                <small>Endereço</small>
                <strong>
                  {[
                    selecionado.endereco,
                    selecionado.numero,
                    selecionado.bairro,
                  ]
                    .filter(Boolean)
                    .join(", ") || "—"}
                </strong>
              </div>

              <div>
                <small>Cidade / Estado</small>
                <strong>
                  {[
                    selecionado.cidade,
                    selecionado.estado,
                  ]
                    .filter(Boolean)
                    .join(" / ") || "—"}
                </strong>
              </div>
            </div>

            {/* CONTRATOS */}

            <h3>
              Contratos vinculados (
              {selecionado.contratos?.length || 0})
            </h3>

            {selecionado.contratos?.length ? (
              selecionado.contratos.map((contrato) => (
                <article
                  className="cc-contrato-card"
                  key={contrato.id}
                >
                  <div>
                    <strong>
                      {contrato.planoNome ||
                        "Plano não definido"}
                    </strong>

                    <span
                      className={`cc-status ${statusClasse(
                        obterStatusVenda(contrato)
                      )}`}
                    >
                      {obterStatusVenda(contrato)}
                    </span>
                  </div>

                  <p>
                    {dinheiro(contrato.valor)} ·{" "}
                    {contrato.periodicidade ||
                      "Periodicidade não informada"}{" "}
                    ·{" "}
                    {contrato.formaPagamento ||
                      "Pagamento não informado"}
                  </p>

                  <p>
                    <strong>Pagamento:</strong>{" "}
                    {obterStatusPagamento(contrato)}
                    {" · "}
                    <strong>Pendência:</strong>{" "}
                    {obterPendenciaCadastro(contrato)}
                  </p>

                  <small>
                    Contrato: {contrato.id} · Vendedor:{" "}
                    {contrato.vendedorNome || "—"} ·{" "}
                    {dataLegivel(contrato.criadoEm)}
                  </small>
                </article>
              ))
            ) : (
              <p className="cc-sem-dados">
                Nenhum contrato vinculado encontrado.
              </p>
            )}

            {/* HISTÓRICO */}

            <h3>
              Histórico e movimentações
            </h3>
            {selecionado.possuiMultiplosContratos && (
              <p className="cc-sem-dados">
                Este cliente possui contratos duplicados. O histórico é
                apresentado apenas quando a associação do contrato é segura.
              </p>
            )}

            {carregandoHistorico ? (
              <p className="cc-sem-dados">
                Carregando histórico...
              </p>
            ) : historico.length ? (
              <div className="cc-historico">
                {historico.map((item) => (
                  <article
                    key={`${item.grupo}-${item.id}`}
                  >
                    <span>{item.grupo}</span>

                    <div>
                      <strong>
                        {item.descricao ||
                          item.titulo ||
                          item.tipo ||
                          "Movimentação registrada"}
                      </strong>
                      {(item.statusPagamento || item.statusPagamentoLabel) && (
                        <small>
                          Pagamento: {item.statusPagamentoLabel || item.statusPagamento}
                        </small>
                      )}
                      {(item.pendenciaCadastro || item.pendenciaCadastroLabel) && (
                        <small>
                          Pendência: {item.pendenciaCadastroLabel || item.pendenciaCadastro}
                        </small>
                      )}

                      <small>
                        {item.usuarioNome || "Sistema"} ·{" "}
                        {dataLegivel(item.criadoEm)}
                      </small>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="cc-sem-dados">
                Não há movimentações disponíveis para exibir.
              </p>
            )}

            {/* AÇÕES DO MODAL */}

            <footer>
              <button
                type="button"
                className="cc-fechar"
                onClick={() => setSelecionado(null)}
              >
                Fechar
              </button>

              <button
                type="button"
                className="cc-editar"
                onClick={() => editarCliente(selecionado)}
                disabled={!selecionado.contratoAtual?.id}
              >
                <Pencil size={15} />
                Editar cadastro
              </button>

              {ehAdmin && (
                <button
                  type="button"
                  className="cc-mudar-status"
                  onClick={abrirModalStatus}
                  disabled={!selecionado.contratoAtual?.id}
                >
                  <SlidersHorizontal size={15} />
                  Mudar status
                </button>
              )}
            </footer>
          </section>
        </div>
      )}

      {/* ===================================================
          MODAL DE MUDANÇA DE STATUS
      =================================================== */}

      {modalStatus && selecionado && (
        <div
          className="cc-modal-fundo cc-status-fundo"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !salvandoStatus) {
              setModalStatus(false);
            }
          }}
        >
          <section
            className="cc-modal cc-modal-status"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cc-status-titulo"
          >
            <header>
              <div>
                <h2 id="cc-status-titulo">
                  Mudar status do cliente
                </h2>

                <span>
                  {selecionado.nomeCompleto}
                </span>
              </div>

              <button
                type="button"
                onClick={() => setModalStatus(false)}
                disabled={salvandoStatus}
                aria-label="Fechar"
              >
                <X size={20} />
              </button>
            </header>

            <div className="cc-status-conteudo">
              <p>
                Selecione a situação correta deste contrato.
                A alteração ficará registrada no histórico.
              </p>

              <label htmlFor="cc-novo-status">
                Status da venda
              </label>

              <select
                id="cc-novo-status"
                value={novoStatus}
                onChange={(e) =>
                  setNovoStatus(e.target.value)
                }
                disabled={salvandoStatus}
              >
                <option value="">
                  Selecione uma opção
                </option>

                {STATUS_CONTRATO.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>

              {novoStatus === "Ativo" && (
                <div className="cc-status-aviso">
                  <AlertCircle size={17} />
                  Ao selecionar Ativo, o cadastro será considerado
                  aprovado. A emissão da carteirinha continuará
                  restrita aos administradores.
                </div>
              )}

              {novoStatus === "Cancelado" && (
                <div className="cc-status-aviso">
                  <AlertCircle size={17} />
                  Confirme se este contrato realmente deve ser
                  cancelado antes de salvar.
                </div>
              )}

              {erroStatus && (
                <div className="cc-alerta">
                  <AlertCircle size={17} />
                  {erroStatus}
                </div>
              )}
            </div>

            <footer>
              <button
                type="button"
                className="cc-fechar"
                onClick={() => setModalStatus(false)}
                disabled={salvandoStatus}
              >
                Voltar
              </button>

              <button
                type="button"
                className="cc-mudar-status"
                onClick={salvarNovoStatus}
                disabled={salvandoStatus || !novoStatus}
              >
                {salvandoStatus ? (
                  <>
                    <RefreshCw
                      size={15}
                      className="cc-girando"
                    />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    Salvar status
                  </>
                )}
              </button>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}
