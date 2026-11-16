import React, { useMemo, useState } from "react";

import "./Checkout.css";

const API_URL = (

  import.meta.env.VITE_API_URL || "https://gestaodoutorsaude.onrender.com"

).replace(/\/+$/, "");

const PAGARME_PUBLIC_KEY = import.meta.env.VITE_PAGARME_PUBLIC_KEY || "";

const moeda = (valor) =>

  Number(valor || 0).toLocaleString("pt-BR", {

    style: "currency",

    currency: "BRL",

  });

function somenteNumeros(valor) {

  return String(valor || "").replace(/\D/g, "");

}

function anoValidadeParaApi(valor) {

  const ano = Number(valor);

  if (!Number.isInteger(ano)) return 0;

  return ano < 100 ? 2000 + ano : ano;

}

export default function Checkout({

  plano,

  vendaExame = null,

  vendaConsulta = null,

  cliente,

  clienteId = "",

  contratoId = "",

  tokenFirebase,

  gerarTokenCartao,

  onVoltar,

  onSucesso,

}) {

  const [modalidade, setModalidade] = useState("mensal");

  const [metodoPagamento, setMetodoPagamento] = useState("pix");

  const [nome, setNome] = useState(
    cliente?.nomeCompleto ||
    cliente?.nome ||
    vendaConsulta?.clienteNome ||
    ""
  );

  const [email, setEmail] = useState(cliente?.email || "");

  const [documento, setDocumento] = useState(
    cliente?.cpf ||
    cliente?.documento ||
    cliente?.cpfCnpj ||
    vendaConsulta?.clienteCPF ||
    ""
  );

  const [telefone, setTelefone] = useState(
    cliente?.celular ||
    cliente?.telefone ||
    vendaConsulta?.clienteTelefone ||
    ""
  );

  // Dados do cartão ficam somente no navegador.

  const [titularCartao, setTitularCartao] = useState("");

  const [numeroCartao, setNumeroCartao] = useState("");

  const [mesValidade, setMesValidade] = useState("");

  const [anoValidade, setAnoValidade] = useState("");

  const [cvv, setCvv] = useState("");

  const [endereco, setEndereco] = useState({

    rua: "",

    numero: "",

    complemento: "",

    bairro: "",

    cidade: "",

    estado: "",

    cep: "",

  });

  const [carregando, setCarregando] = useState(false);

  const [erro, setErro] = useState("");

  const [resultado, setResultado] = useState(null);

  const ehVendaExame = Boolean(vendaExame?.vendaId || vendaExame?.id);
  const ehVendaConsulta = Boolean(vendaConsulta?.vendaId || vendaConsulta?.id);
  const ehVendaAvulsa = ehVendaExame || ehVendaConsulta;

  const vendaId = ehVendaExame
    ? (vendaExame?.vendaId || vendaExame?.id || "")
    : (vendaConsulta?.vendaId || vendaConsulta?.id || "");

  const valorVendaConsulta = Number(
    vendaConsulta?.valorTotal ?? vendaConsulta?.valor ?? 0
  );

  const planoId = plano?.id || plano?.planoId;

  const valores = useMemo(() => {

    if (!plano) return null;

    if (modalidade === "mensal") {

      const valor = Number(plano.valorMensal || 0);

      return { valorParcela: valor, parcelas: 1, total: valor };

    }

    const valorParcela = Number(plano.valorParcelaAnual || 0);

    const parcelas = Number(plano.parcelasAnuais || 12);

    return {

      valorParcela,

      parcelas,

      total: Number((valorParcela * parcelas).toFixed(2)),

    };

  }, [plano, modalidade]);

  function atualizarEndereco(campo, valor) {

    setEndereco((atual) => ({

      ...atual,

      [campo]: valor,

    }));

  }

  function validarFormulario() {

    // Exames e consultas usam vendas já gravadas; planos usam cliente e contrato.
    if (ehVendaExame && !vendaId) {
      return "Não foi possível identificar a venda de exames.";
    }

    if (ehVendaConsulta && !vendaId) {
      return "Não foi possível identificar a venda da consulta.";
    }

    if (!ehVendaAvulsa && (!clienteId || !contratoId)) {

      return "Não foi possível identificar o cliente e o contrato selecionados. Volte à tela de vendas e selecione o cadastro novamente.";

    }

    if (!ehVendaAvulsa && !planoId) {

      return "Não foi possível identificar o plano selecionado.";

    }

    if (!nome.trim()) {

      return "Informe o nome completo do cliente.";

    }

    if (!email.trim()) {

      return "Informe o e-mail do cliente.";

    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {

  // validação do e-mail

      return "Informe um e-mail válido.";

    }

    const cpfCnpj = somenteNumeros(documento);

    if (![11, 14].includes(cpfCnpj.length)) {

      return "Informe um CPF ou CNPJ válido.";

    }

    if (somenteNumeros(telefone).length < 10) {

      return "Informe um telefone com DDD.";

    }

    if (!tokenFirebase) {

      return "Sua sessão expirou. Entre novamente no sistema.";

    }

    if (ehVendaExame && Number(vendaExame?.valorTotal || 0) <= 0) {
      return "O valor da venda de exames está inválido.";
    }

    if (ehVendaConsulta && (!Number.isFinite(valorVendaConsulta) || valorVendaConsulta <= 0)) {
      return "O valor da consulta está inválido.";
    }

    if (!ehVendaAvulsa && (!valores || valores.total <= 0)) {
      return "O valor deste plano não está configurado corretamente.";
    }

    if (metodoPagamento === "credit_card") {

      if (!PAGARME_PUBLIC_KEY) {

        return "A chave pública da Pagar.me não foi configurada. Cadastre VITE_PAGARME_PUBLIC_KEY no ambiente do frontend.";

      }

      if (somenteNumeros(numeroCartao).length < 13) {

        return "Confira o número do cartão.";

      }

      if (!titularCartao.trim()) {

        return "Informe o nome impresso no cartão.";

      }

      const mes = Number(mesValidade);

      if (!Number.isInteger(mes) || mes < 1 || mes > 12) {

        return "Informe o mês de validade do cartão entre 01 e 12.";

      }

      const ano = anoValidadeParaApi(anoValidade);

      const anoAtual = new Date().getFullYear();

      if (

        !Number.isInteger(ano) ||

        ano < anoAtual ||

        ano > anoAtual + 20

      ) {

        return "Confira o ano de validade do cartão.";

      }

      const tamanhoCVV = somenteNumeros(cvv).length;

      if (tamanhoCVV < 3 || tamanhoCVV > 4) {

        return "Confira o código de segurança do cartão.";

      }

    }

    if (

      metodoPagamento === "credit_card" ||

      metodoPagamento === "boleto"

    ) {

      if (

        !endereco.rua.trim() ||

        !endereco.numero.trim() ||

        !endereco.bairro.trim() ||

        !endereco.cidade.trim() ||

        !endereco.estado.trim() ||

        somenteNumeros(endereco.cep).length !== 8

      ) {

        return "Preencha o endereço de cobrança completo, incluindo o CEP.";

      }

    }

    return "";

  }

  async function tokenizarCartao() {

    if (typeof gerarTokenCartao === "function") {

      const token = await gerarTokenCartao();

      if (token) {

        return token;

      }

    }

    if (!PAGARME_PUBLIC_KEY) {

      throw new Error("A chave pública da Pagar.me não está configurada.");

    }

    const resposta = await fetch(

      `https://api.pagar.me/core/v5/tokens?appId=${encodeURIComponent(PAGARME_PUBLIC_KEY)}`,

      {

        method: "POST",

        headers: {

          "Content-Type": "application/json",

        },

        // Nunca enviar a chave secreta ao navegador.

        body: JSON.stringify({

          type: "card",

          card: {

            number: somenteNumeros(numeroCartao),

            holder_name: titularCartao.trim(),

            exp_month: Number(mesValidade),

            exp_year: anoValidadeParaApi(anoValidade),

            cvv: somenteNumeros(cvv),

          },

        }),

      }

    );

    const dados = await resposta.json().catch(() => ({}));

    if (!resposta.ok || !dados.id) {

      throw new Error(

        dados.message ||

          dados.errors?.[0]?.message ||

          "A Pagar.me não conseguiu tokenizar o cartão. Confira os dados e se o domínio está liberado no painel."

      );

    }

    return dados.id;

  }

    // ==================================================

  // FINALIZAR PAGAMENTO

  // ==================================================

  async function finalizarPagamento(event) {

    event.preventDefault();

    if (carregando) return;

    setErro("");

    setResultado(null);

    const mensagem = validarFormulario();

    if (mensagem) {

      setErro(mensagem);

      return;

    }

    setCarregando(true);

    try {

      let cardToken = null;

      if (metodoPagamento === "credit_card") {

        cardToken = await tokenizarCartao();

        if (!cardToken) {

          throw new Error(

            "Não foi possível gerar o token seguro do cartão."

          );

        }

      }

      const dadosCliente = {

        nome: nome.trim(),

        email: email.trim().toLowerCase(),

        documento: somenteNumeros(documento),

        telefone: somenteNumeros(telefone),

      };

      const dadosEndereco =
        metodoPagamento === "credit_card" || metodoPagamento === "boleto"
          ? {
              rua: endereco.rua.trim(),
              numero: endereco.numero.trim(),
              complemento: endereco.complemento.trim(),
              bairro: endereco.bairro.trim(),
              cidade: endereco.cidade.trim(),
              estado: endereco.estado.trim().toUpperCase(),
              cep: somenteNumeros(endereco.cep),
            }
          : undefined;

      const corpo = ehVendaAvulsa
        ? {
            vendaId: String(vendaId),
            metodoPagamento,
            cliente: dadosCliente,
            cardToken,
            billingAddress: dadosEndereco,
          }
        : {
            planoId,
            modalidade,
            metodoPagamento,
            clienteId: String(clienteId),
            contratoId: String(contratoId),
            cliente: dadosCliente,
            cardToken,
            billingAddress: dadosEndereco,
          };

      const endpointCheckout = ehVendaConsulta
        ? `${API_URL}/api/checkout/consultas`
        : ehVendaExame
          ? `${API_URL}/api/checkout/exames`
          : `${API_URL}/api/checkout`;

      const resposta = await fetch(endpointCheckout, {

        method: "POST",

        headers: {

          "Content-Type": "application/json",

          Authorization: `Bearer ${tokenFirebase}`,

        },

        body: JSON.stringify(corpo),

      });

            const dados = await resposta.json().catch(() => ({}));

      if (!resposta.ok || dados.sucesso === false) {

        if (resposta.status === 404 && ehVendaConsulta) {
          throw new Error("A rota /api/checkout/consultas ainda não está publicada no backend. É necessário implementar a rota e o controller de consultas.");
        }

        if (resposta.status === 404 && ehVendaExame) {

          throw new Error(

            "A rota /api/checkout/exames não está publicada no backend. Atualize checkoutRoutes.js e checkoutController.js, envie as alterações ao Git e aguarde o novo deploy no Render."

          );

        }

        throw new Error(

          dados.mensagem ||

            dados.message ||

            "Não foi possível iniciar o pagamento."

        );

      }

      // Só considera sucesso se o backend confirmar o contrato utilizado.

      if (

        !ehVendaAvulsa && dados.contratoId &&

        String(dados.contratoId) !== String(contratoId)

      ) {

        throw new Error(

          "O pagamento foi associado a um contrato diferente do selecionado. Entre em contato com o suporte antes de tentar novamente."

        );

      }

      if (

        !ehVendaAvulsa && dados.clienteId &&

        String(dados.clienteId) !== String(clienteId)

      ) {

        throw new Error(

          "O pagamento foi associado a um cliente diferente do selecionado. Entre em contato com o suporte antes de tentar novamente."

        );

      }

      setResultado(dados);

      // Limpa dados sensíveis depois do envio.

      setNumeroCartao("");

      setCvv("");

      if (typeof onSucesso === "function") {

        await onSucesso(dados);

      }

    } catch (error) {

      console.error("Erro no checkout:", error);

      setErro(

        error.message ||

          "Ocorreu um erro ao processar o pagamento."

      );

    } finally {

      setCarregando(false);

    }

  }

  // ==================================================

  // PLANO NÃO ENCONTRADO

  // ==================================================

  if (!plano && !ehVendaAvulsa) {

    return (

      <main className="checkout-pg">

        <section className="checkout-pg-card">

          <h2>Plano não identificado</h2>

          <p>

            Volte à tela anterior e selecione um plano.

          </p>

          <button type="button" onClick={onVoltar}>

            Voltar

          </button>

        </section>

      </main>

    );

  }

  // ==================================================

  // TELA

  // ==================================================

  return (

    <main className="checkout-pg">

      <div className="checkout-pg-container">

        <header className="checkout-pg-header">

          <button

            type="button"

            className="checkout-pg-voltar"

            onClick={onVoltar}

            disabled={carregando}

          >

            ← Voltar

          </button>

          <div className="checkout-pg-marca">

            <span className="checkout-pg-marca-icone">+</span>

            <div>

              <strong>Doutor Saude Familiar</strong>

              <small>Pagamento seguro</small>

            </div>

          </div>

        </header>

        <div className="checkout-pg-titulo">

          <span>{ehVendaConsulta ? "PAGAMENTO DE CONSULTA" : ehVendaExame ? "PAGAMENTO DE EXAMES" : "FINALIZAÇÃO DA CONTRATAÇÃO"}</span>

          <h1>{ehVendaConsulta ? "Finalize o pagamento da consulta" : ehVendaExame ? "Finalize o pagamento dos exames" : "Finalize seu pagamento"}</h1>

          <p>

            {ehVendaConsulta
              ? "Confira os dados do agendamento, o valor da consulta e escolha como deseja pagar."
              : ehVendaExame
                ? "Confira os exames selecionados, os valores e escolha como deseja pagar."
                : "Confira os dados, escolha a forma de pagamento e conclua sua contratação."}

          </p>

        </div>

        {/* RESULTADO DO PAGAMENTO */}

        {resultado ? (

          <section className="checkout-pg-card checkout-pg-resultado">

            <div className="checkout-pg-sucesso-icone">✓</div>

            <h2>{ehVendaConsulta ? "Cobrança da consulta gerada" : ehVendaExame ? "Cobrança de exames gerada" : "Solicitação de pagamento criada"}</h2>

            <p>

              {resultado.mensagem ||

                "Seu pagamento foi encaminhado."}

            </p>

            {/* PIX */}

            {resultado.qr_code && (

              <div className="checkout-pg-pix">

                <h3>Pagamento via PIX</h3>

                {resultado.qr_code_url && (

                  <img

                    src={resultado.qr_code_url}

                    alt="QR Code PIX"

                    className="checkout-pg-qr"

                  />

                )}

                <label htmlFor="checkout-pix-copia">

                  Código PIX copia e cola

                </label>

                <textarea

                  id="checkout-pix-copia"

                  readOnly

                  value={resultado.qr_code}

                />

                <button

                  type="button"

                  onClick={async () => {

                    try {

                      await navigator.clipboard.writeText(

                        resultado.qr_code

                      );

                      alert("Código PIX copiado.");

                    } catch {

                      alert(

                        "Não foi possível copiar automaticamente. Selecione e copie o código."

                      );

                    }

                  }}

                >

                  Copiar código PIX

                </button>

                {resultado.pix_expira_em && (

                  <small>

                    Expiração: {resultado.pix_expira_em}

                  </small>

                )}

              </div>

            )}

            {/* BOLETO */}

            {resultado.boleto_url && (

              <a

                className="checkout-pg-boleto-link"

                href={resultado.boleto_url}

                target="_blank"

                rel="noreferrer"

              >

                Abrir boleto para pagamento

              </a>

            )}

            {resultado.boleto_linha && (

              <div className="checkout-pg-pix">

                <label htmlFor="checkout-boleto-linha">

                  Linha digitável

                </label>

                <textarea

                  id="checkout-boleto-linha"

                  readOnly

                  value={resultado.boleto_linha}

                />

              </div>

            )}

            {resultado.statusPagamento && (

              <p className="checkout-pg-status">

                Status: {resultado.statusPagamento}

              </p>

            )}

            {resultado.checkout_url && (

              <p>

                <a

                  href={resultado.checkout_url}

                  target="_blank"

                  rel="noreferrer"

                >

                  Abrir página de pagamento

                </a>

              </p>

            )}

            <p className="checkout-pg-aviso">

              {ehVendaConsulta
                ? "Após pagar, a venda de consulta será atualizada quando a Pagar.me confirmar o pagamento por webhook. A guia deve refletir o status real da cobrança."
                : ehVendaExame
                  ? "Após pagar, volte à venda de exames. A confirmação será atualizada quando a Pagar.me notificar o sistema; só então a guia poderá ser emitida."
                  : "A contratação só será confirmada após a confirmação do pagamento pela instituição financeira."}

            </p>

            <button type="button" onClick={onVoltar}>

              {ehVendaConsulta ? "Voltar para vendas de consultas" : ehVendaExame ? "Voltar para venda de exames" : "Voltar para vendas"}

            </button>

          </section>

        ) : (

          <>

            {/* FORMULÁRIO */}

          <form

            className="checkout-pg-layout"

            onSubmit={finalizarPagamento}

          >

            <section className="checkout-pg-card">

              {/* DADOS DO CLIENTE */}

              <div className="checkout-pg-secao-titulo">

                <span>01</span>

                <div>

                  <h2>Dados do cliente</h2>

                  <p>Confira as informações de cadastro.</p>

                </div>

              </div>

              <div className="checkout-pg-campo">

                <label htmlFor="checkout-nome">

                  Nome completo

                </label>

                <input

                  id="checkout-nome"

                  value={nome}

                  onChange={(e) => setNome(e.target.value)}

                  autoComplete="name"

                  required

                />

              </div>

              <div className="checkout-pg-campo">

                <label htmlFor="checkout-email">E-mail</label>

                <input

                  id="checkout-email"

                  type="email"

                  value={email}

                  onChange={(e) => setEmail(e.target.value)}

                  autoComplete="email"

                  required

                />

              </div>

              <div className="checkout-pg-campos-duplos">

                <div className="checkout-pg-campo">

                  <label htmlFor="checkout-documento">

                    CPF ou CNPJ

                  </label>

                  <input

                    id="checkout-documento"

                    value={documento}

                    onChange={(e) => setDocumento(e.target.value)}

                    required

                  />

                </div>

                <div className="checkout-pg-campo">

                  <label htmlFor="checkout-telefone">

                    Telefone com DDD

                  </label>

                  <input

                    id="checkout-telefone"

                    value={telefone}

                    onChange={(e) => setTelefone(e.target.value)}

                    autoComplete="tel"

                    required

                  />

                </div>

              </div>

              <div className="checkout-pg-divisor" />

              {!ehVendaAvulsa && (

                <>

              {/* MODALIDADE */}

              <div className="checkout-pg-secao-titulo">

                <span>02</span>

                <div>

                  <h2>Modalidade do plano</h2>

                  <p>Selecione como deseja contratar.</p>

                </div>

              </div>

              <div className="checkout-pg-opcoes">

                <button

                  type="button"

                  className={

                    modalidade === "mensal"

                      ? "checkout-pg-opcao selecionada"

                      : "checkout-pg-opcao"

                  }

                  onClick={() => setModalidade("mensal")}

                  disabled={plano.modalidadeMensal === false}

                >

                  <strong>Mensal</strong>

                  <span>{moeda(plano.valorMensal)} / mês</span>

                </button>

                <button

                  type="button"

                  className={

                    modalidade === "anual"

                      ? "checkout-pg-opcao selecionada"

                      : "checkout-pg-opcao"

                  }

                  onClick={() => setModalidade("anual")}

                  disabled={plano.modalidadeAnual === false}

                >

                  <strong>Anual</strong>

                  <span>

                    {moeda(plano.valorParcelaAnual)} por parcela

                  </span>

                  <small>

                    {plano.parcelasAnuais || 12} parcelas

                  </small>

                </button>

              </div>

              <div className="checkout-pg-divisor" />

                </>

              )}

              {/* FORMAS DE PAGAMENTO */}

              <div className="checkout-pg-secao-titulo">

                <span>03</span>

                <div>

                  <h2>Forma de pagamento</h2>

                  <p>Escolha uma das opções disponíveis.</p>

                </div>

              </div>

              <div className="checkout-pg-metodos">

                {[

                  [

                    "pix",

                    "▦",

                    "PIX",

                    "Pagamento instantâneo",

                  ],

                  [

                    "credit_card",

                    "▰",

                    "Cartão de crédito",

                    "Pagamento com cartão tokenizado",

                  ],

                  [

                    "boleto",

                    "▤",

                    "Boleto bancário",

                    "Pagamento por código de barras",

                  ],

                ].map(([valor, icone, titulo, descricao]) => (

                  <button

                    key={valor}

                    type="button"

                    className={

                      metodoPagamento === valor

                        ? "checkout-pg-metodo selecionado"

                        : "checkout-pg-metodo"

                    }

                    onClick={() => setMetodoPagamento(valor)}

                  >

                    <span className="checkout-pg-metodo-icone">

                      {icone}

                    </span>

                    <span>

                      <strong>{titulo}</strong>

                      <small>{descricao}</small>

                    </span>

                    <span className="checkout-pg-radio" />

                  </button>

                ))}

              </div>

              {/* CARTÃO */}

              {metodoPagamento === "credit_card" && (

                <>

                  <div className="checkout-pg-aviso-cartao">

                    <strong>Tokenização segura Pagar.me</strong>

                    <p>

                      Os dados do cartão são enviados à Pagar.me

                      para tokenização. O número e o CVV não são

                      enviados ao backend da Doutor Saude Familiar.

                    </p>

                  </div>

                  <div className="checkout-pg-campo">

                    <label htmlFor="checkout-titular">

                      Nome impresso no cartão

                    </label>

                    <input

                      id="checkout-titular"

                      autoComplete="cc-name"

                      value={titularCartao}

                      onChange={(e) =>

                        setTitularCartao(e.target.value)

                      }

                      required

                    />

                  </div>

                  <div className="checkout-pg-campo">

                    <label htmlFor="checkout-numero-cartao">

                      Número do cartão

                    </label>

                    <input

                      id="checkout-numero-cartao"

                      inputMode="numeric"

                      autoComplete="cc-number"

                      value={numeroCartao}

                      onChange={(e) =>

                        setNumeroCartao(e.target.value)

                      }

                      placeholder="Somente números"

                      maxLength={23}

                      required

                    />

                  </div>

                  <div className="checkout-pg-campos-duplos">

                    <div className="checkout-pg-campo">

                      <label htmlFor="checkout-mes">Mês</label>

                      <input

                        id="checkout-mes"

                        inputMode="numeric"

                        autoComplete="cc-exp-month"

                        value={mesValidade}

                        onChange={(e) =>

                          setMesValidade(

                            somenteNumeros(e.target.value).slice(0, 2)

                          )

                        }

                        placeholder="MM"

                        maxLength={2}

                        required

                      />

                    </div>

                    <div className="checkout-pg-campo">

                      <label htmlFor="checkout-ano">Ano</label>

                      <input

                        id="checkout-ano"

                        inputMode="numeric"

                        autoComplete="cc-exp-year"

                        value={anoValidade}

                        onChange={(e) =>

                          setAnoValidade(

                            somenteNumeros(e.target.value).slice(0, 4)

                          )

                        }

                        placeholder="AAAA"

                        maxLength={4}

                        required

                      />

                    </div>

                    <div className="checkout-pg-campo">

                      <label htmlFor="checkout-cvv">CVV</label>

                      <input

                        id="checkout-cvv"

                        type="password"

                        inputMode="numeric"

                        autoComplete="cc-csc"

                        value={cvv}

                        onChange={(e) =>

                          setCvv(

                            somenteNumeros(e.target.value).slice(0, 4)

                          )

                        }

                        maxLength={4}

                        required

                      />

                    </div>

                  </div>

                </>

              )}

              {/* ENDEREÇO PARA CARTÃO E BOLETO */}

              {(metodoPagamento === "credit_card" ||

                metodoPagamento === "boleto") && (

                <>

                  <div className="checkout-pg-divisor" />

                  <div className="checkout-pg-secao-titulo">

                    <span>04</span>

                    <div>

                      <h2>Endereço de cobrança</h2>

                      <p>

                        Necessário para emissão de boleto e

                        validação do cartão.

                      </p>

                    </div>

                  </div>

                  <div className="checkout-pg-campo">

                    <label htmlFor="checkout-rua">

                      Rua / Avenida

                    </label>

                    <input

                      id="checkout-rua"

                      value={endereco.rua}

                      onChange={(e) =>

                        atualizarEndereco("rua", e.target.value)

                      }

                      required

                    />

                  </div>

                  <div className="checkout-pg-campos-duplos">

                    <div className="checkout-pg-campo">

                      <label htmlFor="checkout-numero-endereco">

                        Número

                      </label>

                      <input

                        id="checkout-numero-endereco"

                        value={endereco.numero}

                        onChange={(e) =>

                          atualizarEndereco("numero", e.target.value)

                        }

                        required

                      />

                    </div>

                    <div className="checkout-pg-campo">

                      <label htmlFor="checkout-complemento">

                        Complemento

                      </label>

                      <input

                        id="checkout-complemento"

                        value={endereco.complemento}

                        onChange={(e) =>

                          atualizarEndereco(

                            "complemento",

                            e.target.value

                          )

                        }

                      />

                    </div>

                  </div>

                  <div className="checkout-pg-campo">

                    <label htmlFor="checkout-bairro">Bairro</label>

                    <input

                      id="checkout-bairro"

                      value={endereco.bairro}

                      onChange={(e) =>

                        atualizarEndereco("bairro", e.target.value)

                      }

                      required

                    />

                  </div>

                  <div className="checkout-pg-campos-duplos">

                    <div className="checkout-pg-campo">

                      <label htmlFor="checkout-cidade">Cidade</label>

                      <input

                        id="checkout-cidade"

                        value={endereco.cidade}

                        onChange={(e) =>

                          atualizarEndereco("cidade", e.target.value)

                        }

                        required

                      />

                    </div>

                    <div className="checkout-pg-campo">

                      <label htmlFor="checkout-estado">UF</label>

                      <input

                        id="checkout-estado"

                        value={endereco.estado}

                        onChange={(e) =>

                          atualizarEndereco(

                            "estado",

                            e.target.value.toUpperCase().slice(0, 2)

                          )

                        }

                        maxLength={2}

                        required

                      />

                    </div>

                    <div className="checkout-pg-campo">

                      <label htmlFor="checkout-cep">CEP</label>

                      <input

                        id="checkout-cep"

                        inputMode="numeric"

                        value={endereco.cep}

                        onChange={(e) =>

                          atualizarEndereco(

                            "cep",

                            somenteNumeros(e.target.value).slice(0, 8)

                          )

                        }

                        maxLength={8}

                        required

                      />

                    </div>

                  </div>

                </>

              )}

              {/* ERROS */}

              {erro && (

                <div

                  className="checkout-pg-erro"

                  role="alert"

                >

                  {erro}

                </div>

              )}

              {/* BOTÃO */}

              <button

                className="checkout-pg-finalizar"

                type="submit"

                disabled={carregando}

              >

                {carregando

                  ? "Processando..."

                  : "Continuar para pagamento"}

              </button>

              <div className="checkout-pg-seguranca">

                <span>🔒</span>

                Ambiente de pagamento protegido

              </div>

            </section>

            {/* RESUMO DO PEDIDO */}

            <aside className="checkout-pg-resumo">

              <h2>Resumo do pedido</h2>

              {ehVendaConsulta && (
                <div
                  className="checkout-pg-itens-exames"
                  style={{ margin: "12px 0", padding: "12px", borderRadius: "10px", background: "#f3f8fc" }}
                >
                  <strong style={{ display: "block", marginBottom: "8px" }}>
                    Dados do agendamento
                  </strong>
                  <div style={{ display: "grid", gap: "6px" }}>
                    <span><strong>Cliente:</strong> {vendaConsulta?.clienteNome || nome}</span>
                    <span><strong>Clínica:</strong> {vendaConsulta?.clinicaNome || "Não informada"}</span>
                    <span><strong>Especialidade:</strong> {vendaConsulta?.especialidade || "Não informada"}</span>
                    <span><strong>Médico(a):</strong> {vendaConsulta?.medico || "A confirmar"}</span>
                    <span><strong>Data:</strong> {vendaConsulta?.dataAgendamento || "Não informada"}</span>
                    <span><strong>Horário:</strong> {vendaConsulta?.horarioAgendamento || "Não informado"}</span>
                    <span><strong>Venda:</strong> #{vendaId}</span>
                  </div>
                </div>
              )}

              {ehVendaExame && (

                <div className="checkout-pg-itens-exames" style={{ margin: "12px 0", padding: "12px", borderRadius: "10px", background: "#f3f8fc" }}>

                  <strong style={{ display: "block", marginBottom: "8px" }}>Exames selecionados</strong>

                  {(Array.isArray(vendaExame?.itens) ? vendaExame.itens : []).map((item, index) => (

                    <div key={item.procedimentoId || item.id || index} style={{ display: "flex", justifyContent: "space-between", gap: "12px", padding: "7px 0", borderBottom: "1px solid #dce7f0" }}>

                      <div style={{ minWidth: 0 }}>

                        <strong>{item.exameNome || item.nome || item.titulo || `Exame ${index + 1}`}</strong>

                        {(item.clinicaNome || item.cidadeClinica) && <small style={{ display: "block", color: "#64748b" }}>{[item.clinicaNome, item.cidadeClinica].filter(Boolean).join(" · ")}</small>}

                      </div>

                      <strong style={{ whiteSpace: "nowrap" }}>{moeda(item.valorDoutorTodos ?? item.valor ?? item.preco ?? 0)}</strong>

                    </div>

                  ))}

                  {(!Array.isArray(vendaExame?.itens) || vendaExame.itens.length === 0) && <small>Os itens desta venda não foram carregados. O total permanece vinculado à venda registrada.</small>}

                </div>

              )}

              <div className="checkout-pg-plano">

                <span>{ehVendaConsulta ? "VENDA DE CONSULTA" : ehVendaExame ? "VENDA DE EXAMES" : "PLANO SELECIONADO"}</span>

                <h3>

                  {ehVendaConsulta
                    ? (vendaConsulta?.especialidade || "Consulta")
                    : ehVendaExame
                      ? `${vendaExame?.itens?.length || 0} exame(s) selecionado(s)`
                      : plano.nome || plano.nomePlano || "Plano"}

                </h3>

                <p>

                  {ehVendaAvulsa
                    ? `Venda #${vendaId}`
                    : modalidade === "mensal" ? "Modalidade mensal" : "Modalidade anual"}

                </p>

              </div>

              <div className="checkout-pg-resumo-linha">

                <span>Forma de pagamento</span>

                <strong>

                  {metodoPagamento === "pix"

                    ? "PIX"

                    : metodoPagamento === "boleto"

                    ? "Boleto"

                    : "Cartão"}

                </strong>

              </div>

              {!ehVendaAvulsa && (

                <>

                  <div className="checkout-pg-resumo-linha">

                    <span>Parcelas</span>

                    <strong>{valores?.parcelas || 1}x</strong>

                  </div>

                  <div className="checkout-pg-resumo-linha">

                    <span>Valor por parcela</span>

                    <strong>{moeda(valores?.valorParcela)}</strong>

                  </div>

                </>

              )}

              <div className="checkout-pg-total">

                <span>
                  {ehVendaConsulta
                    ? "Total da consulta"
                    : ehVendaExame
                      ? "Total dos exames"
                      : modalidade === "mensal" ? "Valor mensal" : "Valor total anual"}
                </span>

                <strong>
                  {moeda(
                    ehVendaConsulta
                      ? valorVendaConsulta
                      : ehVendaExame
                        ? vendaExame?.valorTotal
                        : valores?.total
                  )}
                </strong>

              </div>

              <p className="checkout-pg-resumo-nota">

                {ehVendaConsulta
                  ? "O valor exibido corresponde ao valor registrado na venda da consulta. O backend deve validar o valor diretamente no Firestore."
                  : ehVendaExame
                    ? "O valor cobrado é o total da venda de exames registrado no sistema."
                    : "Os valores são calculados com base nas condições cadastradas para o plano."}

              </p>

            </aside>

          </form>

          </>

        )}

        <footer className="checkout-pg-footer">

          Doutor de Todos · Cuidado e economia para sua família.

        </footer>

      </div>

    </main>

  );

}
