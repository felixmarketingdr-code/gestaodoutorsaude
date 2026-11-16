
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  collection,
  getDocs,
  query,
  where,
  doc,
  writeBatch,
  serverTimestamp,
} from "firebase/firestore";

import {
  AlertCircle,
  RefreshCw,
  Search,
  Filter,
  Download,
  FileText,
  CreditCard,
  ClipboardList,
  Stethoscope,
  Users,
  CalendarDays,
  XCircle,
  Pencil,
  SlidersHorizontal,
  Check,
  X,
} from "lucide-react";

import { db } from "../config/firebase";
import "./VendasPendentes.css";

// =====================================================
// FUNÇÕES AUXILIARES
// =====================================================

const normalizar = (v) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const texto = (...valores) =>
  valores.find(
    (v) =>
      v !== undefined &&
      v !== null &&
      String(v).trim() !== ""
  ) ?? "";

const dataValor = (v) => {
  if (!v) return 0;

  if (typeof v?.toDate === "function") {
    return v.toDate().getTime();
  }

  const d = new Date(v);

  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
};

const dataBR = (v) =>
  dataValor(v)
    ? new Date(dataValor(v)).toLocaleDateString("pt-BR")
    : "—";

const dinheiro = (v) =>
  Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const vazio = (v) => {
  const n = normalizar(v);

  return (
    !n ||
    [
      "-",
      "nenhuma",
      "nenhum",
      "nao",
      "nao se aplica",
      "sem pendencia",
      "sem pendencias",
      "regularizado",
      "regularizada",
      "concluido",
      "concluida",
      "resolvido",
      "resolvida",
      "finalizado",
      "finalizada",
      "ok",
    ].includes(n)
  );
};

const statusVenda = (v) =>
  texto(
    v.statusVendaLabel,
    v.statusVenda,
    v.statusLabel,
    v.status,
    v.situacaoVenda,
    "Não informado"
  );

const camposPendencia = (v) =>
  [
    v.pendenciaCadastro,
    v.pendenciaCadastroLabel,
    v.pendenciaCliente,
    v.pendencia,
    v.tipoPendencia,
    v.motivoPendencia,
  ].filter(
    (x) =>
      x !== undefined &&
      x !== null &&
      String(x).trim() !== ""
  );

const pendenciaCadastro = (v) =>
  texto(...camposPendencia(v));

const statusPagamento = (v) =>
  texto(
    v.statusPagamentoLabel,
    v.statusPagamento,
    v.pagamentoStatus,
    v.checkoutStatus,
    v.pagamentoConfirmado === true ? "Pago" : "Não informado"
  );

const ehPendente = (v) => {
  const statusFields = [
    v.statusVenda,
    v.statusVendaLabel,
    v.status,
    v.statusLabel,
    v.situacaoVenda,
  ].map(normalizar);

  const statusPendente = statusFields.some(
    (s) =>
      s.includes("pendente") ||
      s === "pending" ||
      s.includes("aguardando")
  );

  const existePendencia = camposPendencia(v).some(
    (p) => !vazio(p)
  );

  return statusPendente || existePendencia;
};

const ehAdmin = (u, claims = {}) => {
  const perfil = normalizar(
    u?.role ||
      u?.perfil ||
      u?.tipoUsuario ||
      claims.role ||
      claims.perfil
  );

  return (
    [
      "admin",
      "administrador",
      "administracao",
      "gestor",
      "gerente",
    ].includes(perfil) ||
    claims.admin === true ||
    claims.administrador === true
  );
};

const nomeCliente = (v) =>
  texto(
    v.clienteNome,
    v.nomeCliente,
    v.cliente?.nomeCompleto,
    v.cliente?.nome,
    v.titularNome,
    v.nomeCompleto,
    "Cliente não informado"
  );

const cpfCliente = (v) =>
  texto(
    v.clienteCPF,
    v.cpf,
    v.cliente?.cpf,
    v.documento,
    "—"
  );

const vendedor = (v) =>
  texto(
    v.vendedorNome,
    v.responsavelNome,
    v.criadoPorNome,
    v.nomeVendedor,
    v.vendedor,
    "—"
  );

const dataVenda = (v) =>
  texto(
    v.criadoEm,
    v.dataVenda,
    v.dataContratacao,
    v.createdAt,
    v.dataCriacao
  );

// =====================================================
// MAPEAMENTO DOS REGISTROS
// =====================================================

function mapear(docSnap, tipo) {
  const v = docSnap.data();
  const cliente = v.cliente || {};

  const normalizado = {
    ...v,

    id: docSnap.id,
    tipo,

    clienteNome: nomeCliente({
      ...v,
      cliente,
    }),

    clienteCPF: cpfCliente({
      ...v,
      cliente,
    }),

    statusVendaExibicao: statusVenda(v),

    pendenciaExibicao:
      pendenciaCadastro(v) || "Sem pendência informada",

    statusPagamentoExibicao: statusPagamento(v),

    vendedorExibicao: vendedor(v),

    dataVendaExibicao: dataVenda(v),
  };

  if (tipo === "Carteirinha") {
    normalizado.valorExibicao =
      v.valorTotal ??
      v.valor ??
      v.valorContrato ??
      v.valorAdesao ??
      0;
  } else {
    normalizado.valorExibicao =
      v.valorTotal ??
      v.valor ??
      v.valorFinal ??
      0;
  }

  return normalizado;
}

// =====================================================
// COMPONENTE PRINCIPAL
// =====================================================

export default function VendasPendentes({
  usuario,
  onNavigate,
}) {
  const [registros, setRegistros] = useState([]);

  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);

  const [erro, setErro] = useState("");

  const [busca, setBusca] = useState("");

  const [filtrosAbertos, setFiltrosAbertos] = useState(true);

  const [filtros, setFiltros] = useState({
    tipo: "",
    status: "",
    pendencia: "",
    pagamento: "",
    vendedor: "",
    inicio: "",
    fim: "",
  });

  const [admin, setAdmin] = useState(false);

  // ===================================================
  // CONTROLE DA ALTERAÇÃO DE STATUS
  // ===================================================

  const [selecionado, setSelecionado] = useState(null);

  const [novoStatus, setNovoStatus] = useState("");

  const [modalStatus, setModalStatus] = useState(false);

  const [salvandoStatus, setSalvandoStatus] = useState(false);

  const [erroStatus, setErroStatus] = useState("");

  const STATUS_CONTRATO = [
    "Ativo",
    "Pendente",
    "Em análise",
    "Cancelado",
    "Inativo",
  ];

  // ===================================================
  // EDITAR CADASTRO
  // ===================================================

  const editarCadastro = (registro) => {
    if (
      registro.tipo !== "Carteirinha" ||
      !registro.clienteId
    ) {
      alert(
        "A edição por esta tela exige um contrato de carteirinha com clienteId vinculado. Exames e consultas precisam da integração de suas telas próprias."
      );

      return;
    }

    try {
      sessionStorage.setItem(
        "clienteParaEditar",
        JSON.stringify({
          clienteId: registro.clienteId,
          contratoId: registro.id,
        })
      );

      if (onNavigate) {
        onNavigate("/clientes/novo");
      } else {
        window.location.href = "/clientes/novo";
      }
    } catch (e) {
      console.error("Erro ao abrir edição:", e);

      alert(
        "Não foi possível iniciar a edição deste cadastro."
      );
    }
  };

  // ===================================================
  // ABRIR JANELA DE MUDANÇA DE STATUS
  // ===================================================

  const abrirMudancaStatus = (registro) => {
    if (!admin) {
      alert(
        "Somente administradores podem alterar o status da venda."
      );

      return;
    }

    if (registro.tipo !== "Carteirinha") {
      alert(
        "A alteração de status nesta tela está disponível somente para contratos/carteirinhas."
      );

      return;
    }

    setSelecionado(registro);

    setNovoStatus(
      texto(
        registro.statusVenda,
        registro.statusVendaLabel,
        registro.status,
        "Pendente"
      )
    );

    setErroStatus("");

    setModalStatus(true);
  };

  // ===================================================
  // SALVAR NOVO STATUS E REGISTRAR HISTÓRICO
  // ===================================================

  const salvarStatus = async () => {
    if (
      !admin ||
      !selecionado?.id ||
      !STATUS_CONTRATO.includes(novoStatus)
    ) {
      setErroStatus(
        "Selecione um status válido e verifique sua permissão."
      );

      return;
    }

    const anterior = statusVenda(selecionado);

    if (normalizar(anterior) === normalizar(novoStatus)) {
      setErroStatus(
        "A venda já está com esse status."
      );

      return;
    }

    setSalvandoStatus(true);
    setErroStatus("");

    try {
      const nomeUsuario =
        usuario.displayName ||
        usuario.nome ||
        usuario.email ||
        "Administrador";

      const agora = serverTimestamp();

      const contratoRef = doc(
        db,
        "contratos",
        selecionado.id
      );

      const eventoRef = doc(
        collection(
          db,
          "historicoContratos",
          selecionado.id,
          "eventos"
        )
      );

      const evento = {
        eventoId: eventoRef.id,

        clienteId:
          selecionado.clienteId || selecionado.id,

        contratoId: selecionado.id,

        tipo: "alteracao_status_venda",

        grupo: "Histórico",

        descricao:
          `Status da venda alterado de "${anterior}" para "${novoStatus}".`,

        statusAnterior: anterior,

        statusNovo: novoStatus,

        usuarioId: usuario.uid,

        usuarioNome: nomeUsuario,

        origem: "vendas_pendentes",

        criadoEm: agora,
      };

      const dados = {
        statusVenda: novoStatus,
        statusVendaLabel: novoStatus,

        status: novoStatus,
        statusLabel: novoStatus,

        atualizadoEm: agora,

        statusAlteradoPor: usuario.uid,

        statusAlteradoPorNome: nomeUsuario,

        statusAlteradoEm: agora,
      };

      const batch = writeBatch(db);

      // Atualiza o contrato.
      batch.update(
        contratoRef,
        dados
      );

      // Atualiza o cadastro do cliente, quando vinculado.
      if (selecionado.clienteId) {
        batch.update(
          doc(
            db,
            "clientes",
            selecionado.clienteId
          ),
          dados
        );
      }

      // Histórico central.
      batch.set(
        eventoRef,
        evento
      );

      // Histórico do cliente.
      if (selecionado.clienteId) {
        batch.set(
          doc(
            db,
            "clientes",
            selecionado.clienteId,
            "historico",
            eventoRef.id
          ),
          evento
        );
      }

      // Histórico dentro do contrato.
      batch.set(
        doc(
          db,
          "contratos",
          selecionado.id,
          "historico",
          eventoRef.id
        ),
        evento
      );

      await batch.commit();

      setModalStatus(false);
      setSelecionado(null);

      await carregar(true);

    } catch (e) {
      console.error(
        "Erro ao alterar status da venda:",
        e
      );

      setErroStatus(
        e.code === "permission-denied"
          ? "O Firebase bloqueou a alteração. Verifique as permissões do administrador."
          : e.message ||
            "Não foi possível alterar o status."
      );
    } finally {
      setSalvandoStatus(false);
    }
  };

  // ===================================================
  // CARREGAR VENDAS
  // ===================================================

  const carregar = useCallback(
    async (silencioso = false) => {
      if (!usuario?.uid) {
        setRegistros([]);
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

        if (
          typeof usuario.getIdTokenResult === "function"
        ) {
          const token = await usuario.getIdTokenResult(true);

          claims = token?.claims || claims;
        }

        const administrador = ehAdmin(
          usuario,
          claims
        );

        setAdmin(administrador);

        const tarefas = [];

        const adicionar = (
          colecao,
          tipo,
          campo
        ) => {
          const ref = collection(db, colecao);

          if (administrador) {
            tarefas.push(
              getDocs(ref).then((snap) =>
                snap.docs.map((d) =>
                  mapear(d, tipo)
                )
              )
            );
          } else if (colecao === "contratos") {
            for (const chave of [
              "vendedorId",
              "criadoPor",
            ]) {
              tarefas.push(
                getDocs(
                  query(
                    ref,
                    where(chave, "==", usuario.uid)
                  )
                ).then((snap) =>
                  snap.docs.map((d) =>
                    mapear(d, tipo)
                  )
                )
              );
            }
          } else {
            tarefas.push(
              getDocs(
                query(
                  ref,
                  where(campo, "==", usuario.uid)
                )
              ).then((snap) =>
                snap.docs.map((d) =>
                  mapear(d, tipo)
                )
              )
            );
          }
        };

        adicionar(
          "contratos",
          "Carteirinha",
          "vendedorId"
        );

        adicionar(
          "vendasExames",
          "Exame",
          "vendedorId"
        );

        adicionar(
          "vendasConsultas",
          "Consulta",
          "vendedorId"
        );

        const resultados = await Promise.allSettled(
          tarefas
        );

        const falhas = resultados.filter(
          (r) => r.status === "rejected"
        );

        const todos = resultados
          .filter((r) => r.status === "fulfilled")
          .flatMap((r) => r.value);

        const unicos = new Map();

        todos.forEach((r) => {
          unicos.set(
            `${r.tipo}:${r.id}`,
            r
          );
        });

        const pendentes = [...unicos.values()]
          .filter(ehPendente)
          .sort(
            (a, b) =>
              dataValor(b.dataVendaExibicao) -
              dataValor(a.dataVendaExibicao)
          );

        setRegistros(pendentes);

        if (falhas.length) {
          console.warn(
            "Algumas consultas da fila de pendências falharam:",
            falhas.map((f) => f.reason)
          );

          setErro(
            "Parte dos registros não pôde ser consultada. Verifique as regras do Firestore para contratos, vendasExames e vendasConsultas."
          );
        }
      } catch (e) {
        console.error(
          "Erro ao carregar pendências:",
          e
        );

        setErro(
          e.code === "permission-denied"
            ? "Sem permissão para consultar uma ou mais coleções. Verifique as regras do Firestore."
            : e.message ||
              "Não foi possível carregar as pendências."
        );
      } finally {
        setCarregando(false);
        setAtualizando(false);
      }
    },
    [usuario]
  );

  useEffect(() => {
    carregar();
  }, [carregar]);

  // ===================================================
  // OPÇÕES DOS FILTROS
  // ===================================================

  const opcoes = useMemo(
    () => ({
      status: [
        ...new Set(
          registros
            .map((r) => r.statusVendaExibicao)
            .filter(Boolean)
        ),
      ].sort(),

      pendencias: [
        ...new Set(
          registros
            .map((r) => r.pendenciaExibicao)
            .filter(Boolean)
        ),
      ].sort(),

      pagamentos: [
        ...new Set(
          registros
            .map((r) => r.statusPagamentoExibicao)
            .filter(Boolean)
        ),
      ].sort(),

      vendedores: [
        ...new Set(
          registros
            .map((r) => r.vendedorExibicao)
            .filter((v) => v && v !== "—")
        ),
      ].sort(),
    }),
    [registros]
  );

  // ===================================================
  // APLICAR FILTROS
  // ===================================================

  const filtrados = useMemo(() => {
    const termo = normalizar(busca);

    return registros.filter((r) => {
      const textoBusca = [
        r.clienteNome,
        r.clienteCPF,
        r.id,
        r.tipo,
        r.statusVendaExibicao,
        r.pendenciaExibicao,
        r.statusPagamentoExibicao,
        r.vendedorExibicao,
        r.clinicaNome,
        r.especialidade,
        r.planoNome,
        r.plano,
      ]
        .map(normalizar)
        .join(" ");

      const ts = dataValor(r.dataVendaExibicao);

      const inicio = filtros.inicio
        ? new Date(
            `${filtros.inicio}T00:00:00`
          ).getTime()
        : 0;

      const fim = filtros.fim
        ? new Date(
            `${filtros.fim}T23:59:59`
          ).getTime()
        : Infinity;

      return (
        (!termo || textoBusca.includes(termo)) &&
        (!filtros.tipo || r.tipo === filtros.tipo) &&
        (!filtros.status ||
          r.statusVendaExibicao === filtros.status) &&
        (!filtros.pendencia ||
          r.pendenciaExibicao === filtros.pendencia) &&
        (!filtros.pagamento ||
          r.statusPagamentoExibicao === filtros.pagamento) &&
        (!filtros.vendedor ||
          r.vendedorExibicao === filtros.vendedor) &&
        (!filtros.inicio || (ts && ts >= inicio)) &&
        (!filtros.fim || (ts && ts <= fim))
      );
    });
  }, [registros, busca, filtros]);

  // ===================================================
  // CONTROLES DOS FILTROS
  // ===================================================

  const alterar = (campo, valor) =>
    setFiltros((atual) => ({
      ...atual,
      [campo]: valor,
    }));

  const limpar = () => {
    setBusca("");

    setFiltros({
      tipo: "",
      status: "",
      pendencia: "",
      pagamento: "",
      vendedor: "",
      inicio: "",
      fim: "",
    });
  };

  // ===================================================
  // EXPORTAR CSV
  // ===================================================

  const exportarCSV = () => {
    const cabecalho = [
      "Tipo",
      "Cliente",
      "CPF",
      "Status da venda",
      "Pendência de cadastro",
      "Status do pagamento",
      "Valor",
      "Vendedor",
      "Data da venda",
      "ID",
    ];

    const escapar = (v) =>
      `"${String(v ?? "").replace(/"/g, '""')}"`;

    const linhas = filtrados.map((r) => [
      r.tipo,
      r.clienteNome,
      r.clienteCPF,
      r.statusVendaExibicao,
      r.pendenciaExibicao,
      r.statusPagamentoExibicao,
      r.valorExibicao,
      r.vendedorExibicao,
      dataBR(r.dataVendaExibicao),
      r.id,
    ]);

    const blob = new Blob(
      [
        "\uFEFF",
        [cabecalho, ...linhas]
          .map((l) => l.map(escapar).join(";"))
          .join("\r\n"),
      ],
      {
        type: "text/csv;charset=utf-8;",
      }
    );

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");

    a.href = url;

    a.download =
      `vendas-pendentes-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;

    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // ===================================================
  // INDICADORES
  // ===================================================

  const totalValor = filtrados.reduce(
    (s, r) => s + Number(r.valorExibicao || 0),
    0
  );

  const porTipo = (tipo) =>
    filtrados.filter((r) => r.tipo === tipo).length;

  // ===================================================
  // TELA
  // ===================================================

  return (
    <main className="vp-page">

      {/* CABEÇALHO */}

      <header className="vp-header">
        <div>
          <span className="vp-kicker">
            GESTÃO COMERCIAL · REGULARIZAÇÃO
          </span>

          <h1>Vendas Pendentes</h1>

          <p>
            Centralize e acompanhe todas as vendas que ainda
            possuem status pendente ou pendência de cadastro.
          </p>

          <div className="vp-breadcrumb">
            Painel <span>/</span> Vendas <span>/</span>{" "}
            <strong>Pendentes</strong>
          </div>
        </div>

        <button
          className="vp-button vp-button-light"
          type="button"
          onClick={() => carregar(true)}
          disabled={atualizando}
        >
          <RefreshCw
            size={16}
            className={atualizando ? "vp-spin" : ""}
          />

          Atualizar
        </button>
      </header>

      {!admin && (
        <div className="vp-notice">
          <Users size={17} />

          Você está visualizando somente as pendências
          vinculadas ao seu usuário.
        </div>
      )}

      {erro && (
        <div className="vp-error">
          <AlertCircle size={17} />
          {erro}
        </div>
      )}

      {/* INDICADORES */}

      <section className="vp-stats">
        <article>
          <span>Total de pendências</span>
          <strong>{registros.length}</strong>
          <AlertCircle />
        </article>

        <article>
          <span>Carteirinhas</span>
          <strong>{porTipo("Carteirinha")}</strong>
          <FileText />
        </article>

        <article>
          <span>Exames</span>
          <strong>{porTipo("Exame")}</strong>
          <Stethoscope />
        </article>

        <article>
          <span>Consultas</span>
          <strong>{porTipo("Consulta")}</strong>
          <CalendarDays />
        </article>

        <article>
          <span>Valor das vendas listadas</span>
          <strong>{dinheiro(totalValor)}</strong>
          <CreditCard />
        </article>
      </section>

      {/* FILTROS */}

      <section className="vp-panel">

        <button
          className="vp-filter-toggle"
          type="button"
          onClick={() =>
            setFiltrosAbertos((v) => !v)
          }
        >
          <span>
            <Filter size={17} />
            Filtros
          </span>

          <span>
            {filtrosAbertos ? "Recolher" : "Expandir"}
          </span>
        </button>

        {filtrosAbertos && (
          <div className="vp-filters">

            <label>
              Tipo de venda

              <select
                value={filtros.tipo}
                onChange={(e) =>
                  alterar("tipo", e.target.value)
                }
              >
                <option value="">Todos os tipos</option>
                <option>Carteirinha</option>
                <option>Exame</option>
                <option>Consulta</option>
              </select>
            </label>

            <label>
              Status da venda

              <select
                value={filtros.status}
                onChange={(e) =>
                  alterar("status", e.target.value)
                }
              >
                <option value="">Todos os status</option>

                {opcoes.status.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>

            <label>
              Pendência de cadastro

              <select
                value={filtros.pendencia}
                onChange={(e) =>
                  alterar("pendencia", e.target.value)
                }
              >
                <option value="">Todas as pendências</option>

                {opcoes.pendencias.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>

            <label>
              Status do pagamento

              <select
                value={filtros.pagamento}
                onChange={(e) =>
                  alterar("pagamento", e.target.value)
                }
              >
                <option value="">Todos</option>

                {opcoes.pagamentos.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>

            {admin && (
              <label>
                Vendedor

                <select
                  value={filtros.vendedor}
                  onChange={(e) =>
                    alterar("vendedor", e.target.value)
                  }
                >
                  <option value="">
                    Todos os vendedores
                  </option>

                  {opcoes.vendedores.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
            )}

            <label>
              Venda a partir de

              <input
                type="date"
                value={filtros.inicio}
                onChange={(e) =>
                  alterar("inicio", e.target.value)
                }
              />
            </label>

            <label>
              Venda até

              <input
                type="date"
                value={filtros.fim}
                onChange={(e) =>
                  alterar("fim", e.target.value)
                }
              />
            </label>

            <button
              className="vp-clear"
              type="button"
              onClick={limpar}
            >
              <XCircle size={15} />
              Limpar filtros
            </button>

          </div>
        )}
      </section>

      {/* LISTAGEM */}

      <section className="vp-list-panel">

        <div className="vp-toolbar">

          <label className="vp-search">
            <Search size={17} />

            <input
              value={busca}
              onChange={(e) =>
                setBusca(e.target.value)
              }
              placeholder="Buscar cliente, CPF, venda, clínica ou pendência..."
            />
          </label>

          <div className="vp-toolbar-actions">
            <span>
              {filtrados.length} registro(s)
            </span>

            <button
              className="vp-button"
              type="button"
              onClick={exportarCSV}
              disabled={!filtrados.length}
            >
              <Download size={16} />
              Exportar CSV
            </button>
          </div>

        </div>

        {carregando ? (
          <div className="vp-empty">
            Carregando pendências...
          </div>
        ) : filtrados.length === 0 ? (
          <div className="vp-empty">
            <ClipboardList size={34} />

            <strong>
              Nenhuma pendência encontrada
            </strong>

            <span>
              Quando uma venda tiver status pendente ou
              pendência de cadastro, aparecerá aqui.
            </span>
          </div>
        ) : (

          <div className="vp-table-wrap">

            <table className="vp-table">

              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Cliente / CPF</th>
                  <th>Status da venda</th>
                  <th>Pendência de cadastro</th>
                  <th>Pagamento</th>
                  <th>Valor</th>
                  <th>Vendedor</th>
                  <th>Data da venda</th>
                  <th>Registro</th>
                  <th>Ações</th>
                </tr>
              </thead>

              <tbody>

                {filtrados.map((r) => (

                  <tr key={`${r.tipo}:${r.id}`}>

                    <td>
                      <span
                        className={`vp-type vp-type-${normalizar(r.tipo)}`}
                      >
                        {r.tipo}
                      </span>
                    </td>

                    <td>
                      <strong>{r.clienteNome}</strong>
                      <small>{r.clienteCPF}</small>
                    </td>

                    <td>
                      <span className="vp-status">
                        {r.statusVendaExibicao}
                      </span>
                    </td>

                    <td>
                      <span className="vp-pendencia">
                        {r.pendenciaExibicao}
                      </span>
                    </td>

                    <td>
                      {r.statusPagamentoExibicao}
                    </td>

                    <td>
                      {dinheiro(r.valorExibicao)}
                    </td>

                    <td>
                      {r.vendedorExibicao}
                    </td>

                    <td>
                      {dataBR(r.dataVendaExibicao)}
                    </td>

                    <td>
                      <code title={r.id}>
                        {r.id.slice(0, 9)}
                      </code>
                    </td>

                    {/* BOTÕES DE AÇÃO */}

                    <td>
                      <div className="vp-acoes">

                        <button
                          className="vp-button vp-button-light"
                          type="button"
                          onClick={() =>
                            editarCadastro(r)
                          }
                          disabled={
                            r.tipo !== "Carteirinha" ||
                            !r.clienteId
                          }
                          title={
                            r.tipo === "Carteirinha" &&
                            r.clienteId
                              ? "Editar cadastro"
                              : "Edição exige contrato com cliente vinculado"
                          }
                        >
                          <Pencil size={14} />
                          Editar
                        </button>

                        <button
                          className="vp-button"
                          type="button"
                          onClick={() =>
                            abrirMudancaStatus(r)
                          }
                          disabled={
                            !admin ||
                            r.tipo !== "Carteirinha"
                          }
                          title={
                            !admin
                              ? "Somente administradores"
                              : r.tipo === "Carteirinha"
                                ? "Mudar status"
                                : "Status específico ainda não integrado"
                          }
                        >
                          <SlidersHorizontal size={14} />
                          Mudar status
                        </button>

                      </div>
                    </td>

                  </tr>

                ))}

              </tbody>
            </table>

          </div>
        )}

        <footer className="vp-footer">
          A fila é calculada a partir dos registros originais.
          Ao remover o status pendente e resolver a pendência
          de cadastro no registro de origem, a venda deixa de
          aparecer aqui automaticamente na próxima atualização.
        </footer>

      </section>

      {/* =================================================
          MODAL DE ALTERAÇÃO DE STATUS
      ================================================= */}

      {modalStatus && selecionado && (

        <div
          onMouseDown={(e) => {
            if (
              e.target === e.currentTarget &&
              !salvandoStatus
            ) {
              setModalStatus(false);
            }
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(15,35,55,.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >

          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="vp-status-titulo"
            style={{
              width: "min(100%,460px)",
              background: "#fff",
              borderRadius: 12,
              boxShadow: "0 20px 60px rgba(0,0,0,.22)",
              overflow: "hidden",
            }}
          >

            <header
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "18px 20px",
                borderBottom: "1px solid #e8edf2",
              }}
            >

              <div>
                <h2
                  id="vp-status-titulo"
                  style={{
                    margin: 0,
                    fontSize: 18,
                    color: "#244d70",
                  }}
                >
                  Mudar status da venda
                </h2>

                <span
                  style={{
                    fontSize: 12,
                    color: "#718096",
                  }}
                >
                  {selecionado.clienteNome}
                </span>
              </div>

              <button
                type="button"
                onClick={() =>
                  !salvandoStatus &&
                  setModalStatus(false)
                }
                disabled={salvandoStatus}
                aria-label="Fechar"
                style={{
                  border: 0,
                  background: "transparent",
                  cursor: "pointer",
                }}
              >
                <X size={20} />
              </button>

            </header>

            <div style={{ padding: 20 }}>

              <p
                style={{
                  marginTop: 0,
                  color: "#60758a",
                  fontSize: 13,
                }}
              >
                Selecione a situação correta. A alteração
                será registrada no histórico do contrato
                com identificação do administrador.
              </p>

              <label
                htmlFor="vp-novo-status"
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 700,
                  marginBottom: 7,
                  color: "#40566b",
                }}
              >
                Status da venda
              </label>

              <select
                id="vp-novo-status"
                value={novoStatus}
                onChange={(e) =>
                  setNovoStatus(e.target.value)
                }
                disabled={salvandoStatus}
                style={{
                  width: "100%",
                  height: 40,
                  padding: "0 10px",
                  border: "1px solid #d7e1ea",
                  borderRadius: 7,
                }}
              >
                {STATUS_CONTRATO.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              {erroStatus && (
                <p
                  role="alert"
                  style={{
                    color: "#b42318",
                    fontSize: 12,
                    marginBottom: 0,
                  }}
                >
                  {erroStatus}
                </p>
              )}

            </div>

            <footer
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                padding: "14px 20px",
                borderTop: "1px solid #e8edf2",
              }}
            >

              <button
                type="button"
                className="vp-button vp-button-light"
                onClick={() =>
                  setModalStatus(false)
                }
                disabled={salvandoStatus}
              >
                Voltar
              </button>

              <button
                type="button"
                className="vp-button"
                onClick={salvarStatus}
                disabled={
                  salvandoStatus || !novoStatus
                }
              >
                {salvandoStatus ? (
                  <RefreshCw
                    size={14}
                    className="vp-spin"
                  />
                ) : (
                  <Check size={15} />
                )}

                {salvandoStatus
                  ? "Salvando..."
                  : "Salvar status"}
              </button>

            </footer>

          </section>

        </div>
      )}

    </main>
  );
}
