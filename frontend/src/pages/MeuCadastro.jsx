
import { useState } from "react";
import {
  updateProfile,
  verifyBeforeUpdateEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from "firebase/auth";

import {
  UserRound,
  Mail,
  LockKeyhole,
  Save,
  Eye,
  EyeOff,
} from "lucide-react";

import "./MeuCadastro.css";

export default function MeuCadastro({ usuario }) {
  const nomePartes = (usuario.displayName || "").split(" ");

  const [primeiroNome, setPrimeiroNome] = useState(nomePartes[0] || "");
  const [segundoNome, setSegundoNome] = useState(
    nomePartes.slice(1).join(" ")
  );
  const [email, setEmail] = useState(usuario.email || "");

  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");

  const [aba, setAba] = useState("dados");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [erro, setErro] = useState("");

  async function confirmarIdentidade() {
    const senha = window.prompt(
      "Informe sua senha atual para confirmar esta alteração:"
    );

    if (!senha) {
      throw new Error("Operação cancelada.");
    }

    const credencial = EmailAuthProvider.credential(
      usuario.email,
      senha
    );

    await reauthenticateWithCredential(usuario, credencial);
  }

  async function salvarDados(e) {
    e.preventDefault();
    setErro("");
    setMensagem("");
    setCarregando(true);

    try {
      if (!primeiroNome.trim()) {
        throw new Error("Informe seu primeiro nome.");
      }

      const nomeCompleto =
        `${primeiroNome.trim()} ${segundoNome.trim()}`.trim();

      await updateProfile(usuario, {
        displayName: nomeCompleto,
      });

      if (email.trim().toLowerCase() !== usuario.email.toLowerCase()) {
        await confirmarIdentidade();

        await verifyBeforeUpdateEmail(
          usuario,
          email.trim().toLowerCase()
        );

        setMensagem(
          "Nome atualizado. Confira seu novo e-mail para confirmar a alteração."
        );
      } else {
        setMensagem("Seus dados foram atualizados com sucesso!");
      }
    } catch (error) {
      setErro(
        error.code === "auth/email-already-in-use"
          ? "Este e-mail já está sendo utilizado."
          : error.code === "auth/invalid-email"
          ? "Informe um e-mail válido."
          : error.code === "auth/wrong-password" ||
            error.code === "auth/invalid-credential"
          ? "Senha atual incorreta."
          : error.message || "Não foi possível salvar os dados."
      );
    } finally {
      setCarregando(false);
    }
  }

  async function salvarSenha(e) {
    e.preventDefault();
    setErro("");
    setMensagem("");

    if (novaSenha.length < 12) {
      setErro("A nova senha precisa ter pelo menos 12 caracteres.");
      return;
    }

    if (novaSenha !== confirmarSenha) {
      setErro("A confirmação da senha não corresponde.");
      return;
    }

    setCarregando(true);

    try {
      const credencial = EmailAuthProvider.credential(
        usuario.email,
        senhaAtual
      );

      await reauthenticateWithCredential(usuario, credencial);
      await updatePassword(usuario, novaSenha);

      setSenhaAtual("");
      setNovaSenha("");
      setConfirmarSenha("");

      setMensagem("Senha alterada com sucesso!");
    } catch (error) {
      setErro(
        error.code === "auth/wrong-password" ||
        error.code === "auth/invalid-credential"
          ? "A senha atual está incorreta."
          : error.message || "Não foi possível alterar a senha."
      );
    } finally {
      setCarregando(false);
    }
  }

  return (
    <main className="meu-cadastro-page">
      <div className="cadastro-page-header">
        <h1>Meu Cadastro</h1>
        <p>Painel / Meu Cadastro</p>
      </div>

      <section className="cadastro-container">
        <div className="cadastro-tabs">
          <button
            className={aba === "dados" ? "active" : ""}
            onClick={() => setAba("dados")}
          >
            <UserRound size={15} />
            Dados do Cadastro
          </button>

          <button
            className={aba === "senha" ? "active" : ""}
            onClick={() => setAba("senha")}
          >
            <LockKeyhole size={15} />
            Alterar Senha
          </button>
        </div>

        {mensagem && (
          <div className="cadastro-message success">
            {mensagem}
          </div>
        )}

        {erro && (
          <div className="cadastro-message error">
            {erro}
          </div>
        )}

        {aba === "dados" && (
          <form onSubmit={salvarDados}>
            <div className="cadastro-section-title">
              <UserRound size={17} />
              Informações pessoais
            </div>

            <div className="cadastro-fields">
              <label>
                Primeiro Nome
                <input
                  value={primeiroNome}
                  onChange={(e) => setPrimeiroNome(e.target.value)}
                  required
                />
              </label>

              <label>
                Segundo Nome
                <input
                  value={segundoNome}
                  onChange={(e) => setSegundoNome(e.target.value)}
                />
              </label>

              <label>
                E-mail
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </label>

              <label>
                Identificação do Usuário
                <input value={usuario.uid} readOnly />
              </label>
            </div>

            <div className="cadastro-info">
              <Mail size={15} />
              O identificador do usuário é permanente e não pode ser alterado.
            </div>

            <div className="cadastro-buttons">
              <button type="submit" disabled={carregando}>
                <Save size={15} />
                {carregando ? "Salvando..." : "Salvar Alterações"}
              </button>
            </div>
          </form>
        )}

        {aba === "senha" && (
          <form onSubmit={salvarSenha}>
            <div className="cadastro-section-title">
              <LockKeyhole size={17} />
              Segurança da conta
            </div>

            <div className="cadastro-password-fields">
              <label>
                Senha Atual
                <input
                  type="password"
                  value={senhaAtual}
                  onChange={(e) => setSenhaAtual(e.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>

              <label>
                Nova Senha
                <div className="cadastro-password-input">
                  <input
                    type={mostrarSenha ? "text" : "password"}
                    value={novaSenha}
                    onChange={(e) => setNovaSenha(e.target.value)}
                    autoComplete="new-password"
                    required
                  />

                  <button
                    type="button"
                    onClick={() => setMostrarSenha(!mostrarSenha)}
                    aria-label="Mostrar ou ocultar senha"
                  >
                    {mostrarSenha ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </label>

              <label>
                Confirmar Nova Senha
                <input
                  type="password"
                  value={confirmarSenha}
                  onChange={(e) => setConfirmarSenha(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </label>

              <p className="cadastro-password-hint">
                Utilize pelo menos 12 caracteres para sua nova senha.
              </p>
            </div>

            <div className="cadastro-buttons">
              <button type="submit" disabled={carregando}>
                <Save size={15} />
                {carregando ? "Alterando..." : "Alterar Senha"}
              </button>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
