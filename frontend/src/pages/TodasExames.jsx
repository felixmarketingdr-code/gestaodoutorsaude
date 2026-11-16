
import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";

import {
  Activity, CalendarDays, ChevronDown, ChevronUp, Filter, RefreshCw,
  Search, Stethoscope, UserRound, Wallet, FileText, AlertCircle, Download,
} from "lucide-react";

import { db } from "../config/firebase";
import "./TodasExames.css";

const normalizar = (valor) =>
  String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

const somenteNumeros = (valor) => String(valor ?? "").replace(/\D/g, "");

const dataTimestamp = (valor) => {
  if (!valor) return 0;
  if (typeof valor?.toDate === "function") return valor.toDate().getTime();

  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? 0 : data.getTime();
};

const dataBR = (valor) => {
  const timestamp = dataTimestamp(valor);
  return timestamp
    ? new Date(timestamp).toLocaleDateString("pt-BR")
    : "—";
};

const moeda = (valor) =>
  Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

const nomeCliente = (venda) =>
  venda.clienteNome ||
  venda.cliente?.nomeCompleto ||
  venda.cliente?.nome ||
  "Cliente não informado";

const cpfCliente = (venda) =>
  venda.clienteCPF ||
  venda.cliente?.cpf ||
  venda.cliente?.documento ||
  "";

const statusPagamento = (venda) =>
  venda.statusPagamentoLabel ||
  venda.statusPagamento ||
  (venda.pagamentoConfirmado ? "Pago" : "Não informado");

const exameNome = (item) =>
  item?.exameNome ||
  item?.nomeExame ||
  item?.nome ||
  item?.descricao ||
  "Exame não informado";

const clinicaNome = (item) =>
  item?.clinicaNome ||
  item?.nomeClinica ||
  item?.clinica ||
  item?.prestadorNome ||
  "Clínica não informada";

const dataExame = (item, venda) =>
  item?.dataExame ||
  item?.dataAgendamento ||
  item?.data ||
  item?.dataAtendimento ||
  venda.dataExame ||
  venda.dataAgendamento ||
  venda.dataAtendimento ||
  null;

const valorItem = (item) => {
  const candidatos = [
    item?.valorFinal,
    item?.valorVenda,
    item?.valorCliente,
    item?.precoFinal,
    item?.valor,
    item?.preco,
  ];

  for (const candidato of candidatos) {
    if (candidato !== undefined && candidato !== null && candidato !== "") {
      const numero = Number(
        String(candidato)
          .replace(/\\./g, "")
          .replace(",", ".")
          .replace(/[^\d.-]/g, "")
      );

      if (Number.isFinite(numero)) return numero;
    }
  }

  return 0;
};

function identificarAdministrador(usuario, claims = {}) {
  const perfil = normalizar(
    usuario?.role ||
    usuario?.perfil ||
    usuario?.tipoUsuario ||
    claims.role ||
    claims.perfil
  );

  return (
    ["admin", "administrador", "administracao"].includes(perfil) ||
    claims.admin === true ||
    claims.administrador === true
  );
}

export default function TodasExames({ usuario }) {
  const [vendas, setVendas] = useState([]);
  const [ehAdmin, setEhAdmin] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [filtrosAbertos, setFiltrosAbertos] = useState(true);

  const [filtros, setFiltros] = useState({
    clinica: "",
    exame: "",
    pagamento: "",
    vendedor: "",
    dataInicial: "",
    dataFinal: "",
  });

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

      const referencia = collection(db, "vendasExames");

      // Administrador consulta todas as vendas.
      // Vendedor consulta somente as vendas vinculadas ao próprio UID.
      const consulta = administrador
        ? referencia
        : query(
            referencia,
            where("vendedorId", "==", usuario.uid)
          );

      const snapshot = await getDocs(consulta);

      const registros = snapshot.docs.map((documento) => ({
        id: documento.id,
        ...documento.data(),
      }));

      registros.sort(
        (a, b) =>
          dataTimestamp(b.criadoEm || b.dataVenda) -
          dataTimestamp(a.criadoEm || a.dataVenda)
      );

      setVendas(registros);
    } catch (error) {
      console.error("Erro ao carregar vendas de exames:", error);

      setErro(
        error.code === "permission-denied"
          ? "O Firestore bloqueou esta consulta. Confira as regras de leitura da coleção vendasExames para administradores e vendedores."
          : `Não foi possível carregar as vendas: ${
              error.message || "erro desconhecido"
            }`
      );
    } finally {
      setCarregando(false);
      setAtualizando(false);
    }
  }, [usuario]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const linhas = useMemo(
    () =>
      vendas.flatMap((venda) => {
        const itens =
          Array.isArray(venda.itens) && venda.itens.length
            ? venda.itens
            : [{}];

        return itens.map((item, indice) => ({
          id: `${venda.id}_${indice}`,
          vendaId: venda.id,
          venda,
          item,
          indice,
          cliente: nomeCliente(venda),
          cpf: cpfCliente(venda),
          exame: exameNome(item),
          clinica: clinicaNome(item),
          data: dataExame(item, venda),
          valor: valorItem(item),
          pagamento: statusPagamento(venda),
          vendedor:
            venda.vendedorNome ||
            venda.nomeVendedor ||
            "—",
        }));
      }),
    [vendas]
  );

  const opcoes = useMemo(
    () => ({
      clinicas: [
        ...new Set(
          linhas
            .map((linha) => linha.clinica)
            .filter(
              (v) => v && v !== "Clínica não informada"
            )
        ),
      ].sort((a, b) => a.localeCompare(b, "pt-BR")),

      exames: [
        ...new Set(
          linhas
            .map((linha) => linha.exame)
            .filter(
              (v) => v && v !== "Exame não informado"
            )
        ),
      ].sort((a, b) => a.localeCompare(b, "pt-BR")),

      vendedores: [
        ...new Set(
          linhas
            .map((linha) => linha.vendedor)
            .filter((v) => v && v !== "—")
        ),
      ].sort((a, b) => a.localeCompare(b, "pt-BR")),
    }),
    [linhas]
  );

  const filtradas = useMemo(() => {
    const termo = normalizar(busca);

    return linhas.filter((linha) => {
      const texto = [
        linha.cliente,
        linha.cpf,
        linha.exame,
        linha.clinica,
        linha.vendaId,
        linha.vendedor,
        linha.item?.endereco,
      ]
        .map(normalizar)
        .join(" ");

      const data = dataTimestamp(linha.data);

      const inicio = filtros.dataInicial
        ? new Date(`${filtros.dataInicial}T00:00:00`).getTime()
        : 0;

      const fim = filtros.dataFinal
        ? new Date(`${filtros.dataFinal}T23:59:59`).getTime()
        : Infinity;

      return (
        (!termo || texto.includes(termo)) &&
        (!filtros.clinica ||
          linha.clinica === filtros.clinica) &&
        (!filtros.exame ||
          linha.exame === filtros.exame) &&
        (!filtros.pagamento ||
          normalizar(linha.pagamento).includes(
            normalizar(filtros.pagamento)
          )) &&
        (!filtros.vendedor ||
          linha.vendedor === filtros.vendedor) &&
        (!filtros.dataInicial ||
          (data && data >= inicio)) &&
        (!filtros.dataFinal ||
          (data && data <= fim))
      );
    });
  }, [linhas, busca, filtros]);

  const totalVendas = vendas.length;
  const totalExames = linhas.length;

  const totalPago = vendas.filter(
    (v) =>
      v.pagamentoConfirmado === true ||
      normalizar(v.statusPagamento) === "pago"
  ).length;

  const valorTotal = vendas.reduce(
    (soma, venda) =>
      soma + Number(venda.valorTotal || 0),
    0
  );

  const alterarFiltro = (campo, valor) =>
    setFiltros((anterior) => ({
      ...anterior,
      [campo]: valor,
    }));

  const limparFiltros = () => {
    setBusca("");
    setFiltros({
      clinica: "",
      exame: "",
      pagamento: "",
      vendedor: "",
      dataInicial: "",
      dataFinal: "",
    });
  };

  const exportarCSV = () => {
    const cabecalho = [
      "Cliente",
      "CPF",
      "Clínica",
      "Exame vendido",
      "Data do exame",
      "Endereço",
      "Valor do exame",
      "Status do pagamento",
      "Vendedor",
      "Data da venda",
      "ID da venda",
    ];

    const escaparCSV = (valor) =>
      `"${String(valor ?? "").replace(/"/g, '""')}"`;

    const linhasCSV = filtradas.map((linha) => [
      linha.cliente,
      linha.cpf,
      linha.clinica,
      linha.exame,
      dataBR(linha.data),
      linha.item?.endereco ||
        linha.item?.clinicaEndereco ||
        "",
      linha.valor ||
        (linha.venda.itens?.length === 1
          ? linha.venda.valorTotal
          : 0),
      linha.pagamento,
      linha.vendedor,
      dataBR(
        linha.venda.criadoEm ||
        linha.venda.dataVenda
      ),
      linha.vendaId,
    ]);

    const conteudo = [cabecalho, ...linhasCSV]
      .map((linha) =>
        linha.map(escaparCSV).join(";")
      )
      .join("\r\n");

    const arquivo = new Blob(
      ["\uFEFF", conteudo],
      { type: "text/csv;charset=utf-8;" }
    );

    const url = URL.createObjectURL(arquivo);
    const link = document.createElement("a");

    link.href = url;
    link.download =
      `relatorio-todas-exames-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
  };

  return (
    <main className="todas-exames">
      <header className="te-header">
        <div>
          <span className="te-kicker">
            GESTÃO COMERCIAL
          </span>

          <h1>Todos os Exames</h1>

          <p>
            {ehAdmin
              ? "Visão geral de todas as vendas de exames do sistema."
              : "Visualização das vendas de exames realizadas por você."}
          </p>

          <div className="te-breadcrumb">
            <span>Vendas</span>
            <span>/</span>
            <strong>Exames</strong>
          </div>
        </div>

        <button
          className="te-refresh"
          type="button"
          onClick={() => carregar(true)}
          disabled={atualizando}
        >
          <RefreshCw
            size={16}
            className={atualizando ? "te-spin" : ""}
          />
          Atualizar
        </button>
      </header>

      {!ehAdmin && (
        <div className="te-scope">
          <UserRound size={16} />
          Os dados exibidos são somente das vendas vinculadas ao seu usuário.
          A visão geral é restrita aos administradores.
        </div>
      )}

      <section className="te-metrics">
        <article>
          <span>Vendas registradas</span>
          <strong>{totalVendas}</strong>
          <FileText size={21} />
        </article>

        <article>
          <span>Exames vendidos</span>
          <strong>{totalExames}</strong>
          <Stethoscope size={21} />
        </article>

        <article>
          <span>Vendas pagas</span>
          <strong>{totalPago}</strong>
          <Activity size={21} />
        </article>

        <article>
          <span>Valor total das vendas</span>
          <strong>{moeda(valorTotal)}</strong>
          <Wallet size={21} />
        </article>
      </section>

      <section className="te-panel">
        <button
          className="te-filter-title"
          type="button"
          onClick={() =>
            setFiltrosAbertos((v) => !v)
          }
        >
          <span>
            <Filter size={16} />
            Filtros
          </span>

          {filtrosAbertos
            ? <ChevronUp size={18} />
            : <ChevronDown size={18} />}
        </button>

        {filtrosAbertos && (
          <div className="te-filters">
            <label>
              Clínica
              <select
                value={filtros.clinica}
                onChange={(e) =>
                  alterarFiltro("clinica", e.target.value)
                }
              >
                <option value="">Todas as clínicas</option>
                {opcoes.clinicas.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>

            <label>
              Exame
              <select
                value={filtros.exame}
                onChange={(e) =>
                  alterarFiltro("exame", e.target.value)
                }
              >
                <option value="">Todos os exames</option>
                {opcoes.exames.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>

            <label>
              Status do pagamento
              <select
                value={filtros.pagamento}
                onChange={(e) =>
                  alterarFiltro("pagamento", e.target.value)
                }
              >
                <option value="">Todos</option>
                <option value="pago">Pago</option>
                <option value="pendente">Pendente</option>
                <option value="nao iniciado">Não iniciado</option>
                <option value="recusado">Recusado</option>
              </select>
            </label>

            {ehAdmin && (
              <label>
                Vendedor
                <select
                  value={filtros.vendedor}
                  onChange={(e) =>
                    alterarFiltro("vendedor", e.target.value)
                  }
                >
                  <option value="">Todos os vendedores</option>
                  {opcoes.vendedores.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
            )}

            <label>
              Data inicial
              <input
                type="date"
                value={filtros.dataInicial}
                onChange={(e) =>
                  alterarFiltro("dataInicial", e.target.value)
                }
              />
            </label>

            <label>
              Data final
              <input
                type="date"
                value={filtros.dataFinal}
                onChange={(e) =>
                  alterarFiltro("dataFinal", e.target.value)
                }
              />
            </label>

            <div className="te-filter-actions">
              <button
                type="button"
                className="te-clear"
                onClick={limparFiltros}
              >
                Limpar filtros
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="te-table-panel">
        <div className="te-table-top">
          <label className="te-search">
            <Search size={17} />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar cliente, CPF, exame, clínica ou venda..."
            />
          </label>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <span>
              {filtradas.length} exame(s) encontrado(s)
            </span>

            <button
              type="button"
              className="te-refresh"
              onClick={exportarCSV}
              disabled={filtradas.length === 0}
            >
              <Download size={16} />
              Exportar CSV
            </button>
          </div>
        </div>

        {erro && (
          <div className="te-error">
            <AlertCircle size={17} />
            {erro}
          </div>
        )}

        {carregando ? (
          <div className="te-empty">
            Carregando vendas de exames...
          </div>
        ) : filtradas.length === 0 ? (
          <div className="te-empty">
            <Stethoscope size={30} />
            <strong>Nenhum exame encontrado</strong>
            <span>
              Quando uma venda de exame for registrada,
              ela aparecerá nesta listagem.
            </span>
          </div>
        ) : (
          <div className="te-scroll">
            <table className="te-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>CPF</th>
                  <th>Clínica</th>
                  <th>Exame vendido</th>
                  <th>Data do exame</th>
                  <th>Endereço</th>
                  <th>Valor do exame</th>
                  <th>Pagamento</th>
                  <th>Vendedor</th>
                  <th>Data da venda</th>
                  <th>Nº da venda</th>
                </tr>
              </thead>

              <tbody>
                {filtradas.map((linha) => (
                  <tr key={linha.id}>
                    <td>
                      <strong>{linha.cliente}</strong>
                    </td>

                    <td>{linha.cpf || "—"}</td>
                    <td>{linha.clinica}</td>
                    <td>{linha.exame}</td>
                    <td>{dataBR(linha.data)}</td>

                    <td>
                      {linha.item?.endereco ||
                        linha.item?.clinicaEndereco ||
                        "—"}
                    </td>

                    <td>
                      {moeda(
                        linha.valor ||
                        (linha.venda.itens?.length === 1
                          ? linha.venda.valorTotal
                          : 0)
                      )}
                    </td>

                    <td>
                      <span
                        className={`te-payment ${
                          normalizar(linha.pagamento).includes("pago")
                            ? "is-paid"
                            : "is-pending"
                        }`}
                      >
                        {linha.pagamento}
                      </span>
                    </td>

                    <td>{linha.vendedor}</td>

                    <td>
                      {dataBR(
                        linha.venda.criadoEm ||
                        linha.venda.dataVenda
                      )}
                    </td>

                    <td title={linha.vendaId}>
                      {linha.vendaId.slice(0, 9)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <footer className="te-footer">
          Exibindo {filtradas.length} de {linhas.length} exame(s), em{" "}
          {vendas.length} venda(s).
          {!ehAdmin
            ? " Totais limitados às suas próprias vendas."
            : " Totais gerais do sistema."}
        </footer>
      </section>
    </main>
  );
}
