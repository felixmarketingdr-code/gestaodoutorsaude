
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";

import {
  RefreshCw,
  Search,
  XCircle,
  AlertCircle,
  FileText,
  Stethoscope,
  CalendarDays,
  Download,
  CreditCard,
  Filter,
  Users,
  ClipboardList,
} from "lucide-react";

import { db } from "../config/firebase";
import "./VendasCanceladas.css";

// ==========================================
// FUNÇÕES AUXILIARES
// ==========================================

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

// ==========================================
// IDENTIFICAÇÃO DO STATUS
// ==========================================

const obterStatus = (v) =>
  texto(
    v.statusVendaLabel,
    v.statusVenda,
    v.statusLabel,
    v.status,
    v.situacaoVenda,
    v.statusContrato,
    v.situacao,
    "Não informado"
  );

const estaCancelada = (v) => {
  const campos = [
    v.statusVenda,
    v.statusVendaLabel,
    v.statusLabel,
    v.status,
    v.situacaoVenda,
    v.statusContrato,
    v.situacao,
  ];

  return campos.some((campo) => {
    const status = normalizar(campo);

    return (
      status === "cancelado" ||
      status === "cancelada" ||
      status === "canceled" ||
      status === "cancelled" ||
      status.includes("cancelamento")
    );
  });
};

// ==========================================
// IDENTIFICAÇÃO DO ADMINISTRADOR
// ==========================================

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

// ==========================================
// DADOS DO REGISTRO
// ==========================================

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

const dataCancelamento = (v) =>
  texto(
    v.canceladoEm,
    v.dataCancelamento,
    v.cancelamentoEm,
    v.dataCancelada,
    ""
  );

const motivoCancelamento = (v) =>
  texto(
    v.motivoCancelamento,
    v.motivoCancelamentoLabel,
    v.justificativaCancelamento,
    v.observacaoCancelamento,
    v.motivo,
    "Não informado"
  );

// ==========================================
// MAPEAMENTO DAS COLEÇÕES
// ==========================================

function mapear(docSnap, tipo) {
  const v = docSnap.data();

  const cliente = v.cliente || {};

  const colecao =
    tipo === "Carteirinha"
      ? "contratos"
      : tipo === "Exame"
        ? "vendasExames"
        : "vendasConsultas";

  const valor =
    tipo === "Carteirinha"
      ? (
          v.valorTotal ??
          v.valor ??
          v.valorContrato ??
          v.valorAdesao ??
          0
        )
      : (
          v.valorTotal ??
          v.valor ??
          v.valorFinal ??
          0
        );

  return {
    ...v,

    id: docSnap.id,

    tipo,

    colecao,

    clienteNome: nomeCliente({
      ...v,
      cliente,
    }),

    clienteCPF: cpfCliente({
      ...v,
      cliente,
    }),

    vendedorExibicao: vendedor(v),

    statusExibicao: obterStatus(v),

    pagamentoExibicao: texto(
      v.statusPagamentoLabel,
      v.statusPagamento,
      v.pagamentoStatus,
      v.checkoutStatus,
      v.pagamentoConfirmado === true
        ? "Pago"
        : "Não informado"
    ),

    valorExibicao: valor,

    dataCancelamentoExibicao: dataCancelamento(v),

    dataOrdenacao:
      dataValor(dataCancelamento(v)) ||
      dataValor(v.atualizadoEm) ||
      dataValor(v.updatedAt) ||
      dataValor(v.criadoEm) ||
      dataValor(v.dataVenda) ||
      0,

    motivoExibicao: motivoCancelamento(v),

    dataVendaExibicao:
      v.criadoEm ||
      v.dataVenda ||
      v.dataContratacao ||
      v.createdAt ||
      null,
  };
}

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================

export default function VendasCanceladas({ usuario }) {

  const [registros, setRegistros] = useState([]);

  const [carregando, setCarregando] = useState(true);

  const [atualizando, setAtualizando] = useState(false);

  const [erro, setErro] = useState("");

  const [busca, setBusca] = useState("");

  const [filtrosAbertos, setFiltrosAbertos] = useState(true);

  const [admin, setAdmin] = useState(false);

  const [filtros, setFiltros] = useState({
    tipo: "",
    pagamento: "",
    vendedor: "",
    inicio: "",
    fim: "",
  });

  // ========================================
  // CARREGAR VENDAS CANCELADAS
  // ========================================

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

        const administrador = ehAdmin(usuario, claims);

        setAdmin(administrador);

        const tarefas = [];

        // Consulta cada coleção respeitando o perfil.

        const adicionar = (colecao, tipo, campo) => {

          const ref = collection(db, colecao);

          if (administrador) {

            tarefas.push(
              getDocs(ref).then((snap) =>
                snap.docs.map((d) => mapear(d, tipo))
              )
            );

          } else if (colecao === "contratos") {

            for (const chave of ["vendedorId", "criadoPor"]) {

              tarefas.push(
                getDocs(
                  query(
                    ref,
                    where(chave, "==", usuario.uid)
                  )
                ).then((snap) =>
                  snap.docs.map((d) => mapear(d, tipo))
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
                snap.docs.map((d) => mapear(d, tipo))
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

        // ====================================
        // RESULTADOS
        // ====================================

        const resultados = await Promise.allSettled(tarefas);

        const falhas = resultados.filter(
          (r) => r.status === "rejected"
        );

        const todos = resultados
          .filter((r) => r.status === "fulfilled")
          .flatMap((r) => r.value);

        // Evita registros duplicados.

        const unicos = new Map();

        todos.forEach((r) => {
          unicos.set(`${r.tipo}:${r.id}`, r);
        });

        // Somente vendas efetivamente canceladas.

        const canceladas = [...unicos.values()]
          .filter(estaCancelada)
          .sort(
            (a, b) => b.dataOrdenacao - a.dataOrdenacao
          );

        setRegistros(canceladas);

        if (falhas.length) {

          console.warn(
            "Falhas ao consultar vendas canceladas:",
            falhas.map((f) => f.reason)
          );

          setErro(
            "Parte dos registros não pôde ser consultada. Verifique as regras do Firestore para contratos, vendasExames e vendasConsultas."
          );

        }

      } catch (e) {

        console.error(
          "Erro ao carregar vendas canceladas:",
          e
        );

        setErro(
          e.code === "permission-denied"
            ? "Sem permissão para consultar uma ou mais coleções. Verifique as regras do Firestore."
            : e.message ||
              "Não foi possível carregar as vendas canceladas."
        );

      } finally {

        setCarregando(false);
        setAtualizando(false);

      }

    },
    [usuario]
  );

  // ========================================
  // INICIALIZAÇÃO
  // ========================================

  useEffect(() => {
    carregar();
  }, [carregar]);

  // ========================================
  // OPÇÕES DOS FILTROS
  // ========================================

  const opcoes = useMemo(
    () => ({
      pagamentos: [
        ...new Set(
          registros
            .map((r) => r.pagamentoExibicao)
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

  // ========================================
  // FILTRAGEM
  // ========================================

  const filtrados = useMemo(() => {

    const termo = normalizar(busca);

    return registros.filter((r) => {

      const textoBusca = [
        r.clienteNome,
        r.clienteCPF,
        r.id,
        r.tipo,
        r.statusExibicao,
        r.pagamentoExibicao,
        r.vendedorExibicao,
        r.motivoExibicao,
      ]
        .map(normalizar)
        .join(" ");

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

      const ts =
        dataValor(r.dataCancelamentoExibicao) ||
        r.dataOrdenacao;

      return (
        (!termo || textoBusca.includes(termo)) &&

        (!filtros.tipo || r.tipo === filtros.tipo) &&

        (
          !filtros.pagamento ||
          r.pagamentoExibicao === filtros.pagamento
        ) &&

        (
          !filtros.vendedor ||
          r.vendedorExibicao === filtros.vendedor
        ) &&

        (!filtros.inicio || (ts && ts >= inicio)) &&

        (!filtros.fim || (ts && ts <= fim))
      );

    });

  }, [registros, busca, filtros]);

  // ========================================
  // CONTROLE DOS FILTROS
  // ========================================

  const alterar = (campo, valor) => {

    setFiltros((atual) => ({
      ...atual,
      [campo]: valor,
    }));

  };

  const limpar = () => {

    setBusca("");

    setFiltros({
      tipo: "",
      pagamento: "",
      vendedor: "",
      inicio: "",
      fim: "",
    });

  };

  // ========================================
  // EXPORTAR CSV
  // ========================================

  const exportarCSV = () => {

    const cabecalho = [
      "Tipo",
      "Cliente",
      "CPF",
      "Status da venda",
      "Status do pagamento",
      "Valor",
      "Vendedor",
      "Data do cancelamento",
      "Motivo do cancelamento",
      "ID",
    ];

    const escapar = (v) =>
      `"${String(v ?? "").replace(/"/g, '""')}"`;

    const linhas = filtrados.map((r) => [
      r.tipo,
      r.clienteNome,
      r.clienteCPF,
      r.statusExibicao,
      r.pagamentoExibicao,
      r.valorExibicao,
      r.vendedorExibicao,
      dataBR(r.dataCancelamentoExibicao),
      r.motivoExibicao,
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

    a.download = `vendas-canceladas-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;

    document.body.appendChild(a);

    a.click();

    a.remove();

    URL.revokeObjectURL(url);

  };

  // ========================================
  // INDICADORES
  // ========================================

  const totalValor = filtrados.reduce(
    (s, r) => s + Number(r.valorExibicao || 0),
    0
  );

  const porTipo = (tipo) =>
    filtrados.filter((r) => r.tipo === tipo).length;

  // ========================================
  // RENDERIZAÇÃO
  // ========================================

  return (

    <main className="vc-page">

      {/* CABEÇALHO */}

      <header className="vc-header">

        <div>

          <span className="vc-kicker">
            GESTÃO COMERCIAL · HISTÓRICO
          </span>

          <h1>Vendas Canceladas</h1>

          <p>
            Consulte e acompanhe todas as operações comerciais
            que foram canceladas.
          </p>

          <div className="vc-breadcrumb">
            Painel <span>/</span> Vendas <span>/</span>
            <strong> Canceladas</strong>
          </div>

        </div>

        <button
          className="vc-button vc-button-light"
          type="button"
          onClick={() => carregar(true)}
          disabled={atualizando}
        >
          <RefreshCw
            size={16}
            className={atualizando ? "vc-spin" : ""}
          />

          Atualizar
        </button>

      </header>

      {/* AVISO DE PERMISSÃO */}

      {!admin && (
        <div className="vc-notice">
          <Users size={17} />

          Você está visualizando somente os cancelamentos
          vinculados ao seu usuário.
        </div>
      )}

      {/* ERROS */}

      {erro && (
        <div className="vc-error">
          <AlertCircle size={17} />
          {erro}
        </div>
      )}

      {/* INDICADORES */}

      <section className="vc-stats">

        <article>
          <span>Total de cancelamentos</span>
          <strong>{filtrados.length}</strong>
          <XCircle />
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

      <section className="vc-panel">

        <button
          className="vc-filter-toggle"
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

          <div className="vc-filters">

            <label>
              Tipo de venda

              <select
                value={filtros.tipo}
                onChange={(e) =>
                  alterar("tipo", e.target.value)
                }
              >
                <option value="">Todos os tipos</option>
                <option value="Carteirinha">Carteirinha</option>
                <option value="Exame">Exame</option>
                <option value="Consulta">Consulta</option>
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
                  <option key={v} value={v}>
                    {v}
                  </option>
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
                  <option value="">Todos os vendedores</option>

                  {opcoes.vendedores.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}

                </select>
              </label>
            )}

            <label>
              Cancelamento a partir de

              <input
                type="date"
                value={filtros.inicio}
                onChange={(e) =>
                  alterar("inicio", e.target.value)
                }
              />
            </label>

            <label>
              Cancelamento até

              <input
                type="date"
                value={filtros.fim}
                onChange={(e) =>
                  alterar("fim", e.target.value)
                }
              />
            </label>

            <button
              className="vc-clear"
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

      <section className="vc-list-panel">

        <div className="vc-toolbar">

          <label className="vc-search">

            <Search size={17} />

            <input
              type="text"
              value={busca}
              onChange={(e) =>
                setBusca(e.target.value)
              }
              placeholder="Buscar cliente, CPF, vendedor ou motivo..."
            />

          </label>

          <div className="vc-toolbar-actions">

            <span>
              {filtrados.length} registro(s)
            </span>

            <button
              className="vc-button"
              type="button"
              onClick={exportarCSV}
              disabled={!filtrados.length}
            >
              <Download size={16} />
              Exportar CSV
            </button>

          </div>

        </div>

        {/* CARREGAMENTO */}

        {carregando ? (

          <div className="vc-empty">
            Carregando vendas canceladas...
          </div>

        ) : filtrados.length === 0 ? (

          <div className="vc-empty">

            <ClipboardList size={35} />

            <strong>
              Nenhuma venda cancelada encontrada
            </strong>

            <span>
              Quando uma venda receber status de cancelada,
              ela aparecerá automaticamente nesta página.
            </span>

          </div>

        ) : (

          <div className="vc-table-wrap">

            <table className="vc-table">

              <thead>

                <tr>
                  <th>Tipo</th>
                  <th>Cliente / CPF</th>
                  <th>Status</th>
                  <th>Pagamento</th>
                  <th>Valor</th>
                  <th>Vendedor</th>
                  <th>Data do cancelamento</th>
                  <th>Motivo</th>
                  <th>Registro</th>
                </tr>

              </thead>

              <tbody>

                {filtrados.map((r) => (

                  <tr key={`${r.tipo}:${r.id}`}>

                    <td>
                      <span
                        className={`vc-type vc-type-${normalizar(r.tipo)}`}
                      >
                        {r.tipo}
                      </span>
                    </td>

                    <td>
                      <strong>{r.clienteNome}</strong>
                      <small>{r.clienteCPF}</small>
                    </td>

                    <td>
                      <span className="vc-status">
                        {r.statusExibicao}
                      </span>
                    </td>

                    <td>
                      {r.pagamentoExibicao}
                    </td>

                    <td>
                      {dinheiro(r.valorExibicao)}
                    </td>

                    <td>
                      {r.vendedorExibicao}
                    </td>

                    <td>
                      {dataBR(r.dataCancelamentoExibicao)}
                    </td>

                    <td>
                      {r.motivoExibicao}
                    </td>

                    <td>
                      <code title={r.id}>
                        {r.id.slice(0, 9)}
                      </code>
                    </td>

                  </tr>

                ))}

              </tbody>

            </table>

          </div>

        )}

        {/* RODAPÉ */}

        <footer className="vc-footer">

          Esta página consulta os registros originais de
          contratos, vendas de exames e vendas de consultas.
          Os cancelamentos são identificados pelo status
          registrado no Firestore.

        </footer>

      </section>

    </main>

  );

}
