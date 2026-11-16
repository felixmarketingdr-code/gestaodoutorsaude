
import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../config/firebase";

import {
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";

import logotipo from "../assets/logotipo.jpg";
import "./Login.css";

export default function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function entrar(e) {
    e.preventDefault();

    if (carregando) return;

    setErro("");
    setCarregando(true);

    try {
      await signInWithEmailAndPassword(
        auth,
        email.trim(),
        senha
      );

      // O App.jsx identifica a autenticação
      // e abre automaticamente o Dashboard.

    } catch (error) {
      console.error("Erro no login:", error.code);

      const mensagens = {
        "auth/invalid-credential":
          "E-mail ou senha incorretos.",

        "auth/user-not-found":
          "Usuário não encontrado.",

        "auth/wrong-password":
          "Senha incorreta.",

        "auth/invalid-email":
          "Informe um endereço de e-mail válido.",

        "auth/too-many-requests":
          "Muitas tentativas. Aguarde alguns minutos e tente novamente.",

        "auth/network-request-failed":
          "Falha de conexão. Verifique sua internet.",

        "auth/user-disabled":
          "Este usuário está desativado. Entre em contato com o administrador.",

        "auth/operation-not-allowed":
          "O acesso por e-mail e senha não está habilitado.",
      };

      setErro(
        mensagens[error.code] ||
        "Não foi possível realizar o acesso. Tente novamente."
      );

    } finally {
      setCarregando(false);
    }
  }

  return (
    <main className="login-page">

      <section className="login-card">

        {/* IDENTIDADE DO SISTEMA */}

        <div className="login-brand">

          <img
            src={logotipo}
            alt="Logotipo Doutor Saude Familiar"
            className="login-logo"
          />

          <h1>Gestão Doutor Saúde Familiar</h1>

          <p>
            Gestão inteligente, em um só lugar.
          </p>

        </div>

        {/* APRESENTAÇÃO */}

        <div className="login-heading">

          <h2>Bem-vindo!</h2>

          <p>
            Entre com seus dados para acessar o sistema.
          </p>

        </div>

        {/* FORMULÁRIO */}

        <form onSubmit={entrar}>

          <label htmlFor="email">
            E-mail
          </label>

          <div className="login-input">

            <Mail size={19} />

            <input
              id="email"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
              disabled={carregando}
            />

          </div>

          <label htmlFor="senha">
            Senha
          </label>

          <div className="login-input">

            <LockKeyhole size={19} />

            <input
              id="senha"
              type={mostrarSenha ? "text" : "password"}
              placeholder="Digite sua senha"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete="current-password"
              required
              disabled={carregando}
            />

            <button
              type="button"
              className="password-toggle"
              onClick={() =>
                setMostrarSenha((anterior) => !anterior)
              }
              aria-label={
                mostrarSenha
                  ? "Ocultar senha"
                  : "Mostrar senha"
              }
              disabled={carregando}
            >
              {mostrarSenha ? (
                <EyeOff size={19} />
              ) : (
                <Eye size={19} />
              )}
            </button>

          </div>

          {/* MENSAGEM DE ERRO */}

          {erro && (
            <div
              className="login-error"
              role="alert"
            >
              {erro}
            </div>
          )}

          {/* BOTÃO DE ACESSO */}

          <button
            type="submit"
            className="login-submit"
            disabled={carregando}
          >
            {carregando
              ? "Verificando acesso..."
              : "Acessar sistema"}
          </button>

        </form>

        {/* SEGURANÇA */}

        <div className="login-security">
          <ShieldCheck size={16} />

          <span>
            Acesso protegido
          </span>
        </div>

        {/* RODAPÉ */}

        <footer className="login-footer">
          Gestão Doutor Saúde Familiar © {new Date().getFullYear()}
        </footer>

      </section>

    </main>
  );
}
