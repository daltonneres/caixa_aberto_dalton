# Caixa Aberto — controle financeiro de clientes

App simples pra cadastrar clientes, lançar cobranças e mandar a mensagem de cobrança
já pronta no WhatsApp (você clica em "Enviar" e ele abre o WhatsApp com o número e o
texto preenchidos — o envio final é manual, um clique).

Roda 100% no navegador. Não tem servidor, não tem banco de dados. Os dados ficam
salvos no `localStorage` do navegador, **só nesse aparelho/navegador**. Por isso tem
o botão de **exportar backup** nas Configurações — use ele de vez em quando.

## Como usar localmente (só testar no seu PC)

Dá pra abrir o `index.html` direto no navegador com duplo clique. Funciona, mas
alguns navegadores restringem um pouco arquivos abertos assim. O ideal é subir pro
GitHub Pages (é grátis e leva 5 minutos), aí você acessa de qualquer lugar como um
site normal.

## Como colocar no ar com GitHub Pages (grátis)

1. Crie uma conta no [github.com](https://github.com) se ainda não tiver.
2. Crie um repositório novo (pode ser público ou privado — GitHub Pages funciona
   nos dois, mas em repositório privado você precisa de um plano pago pra ativar o
   Pages; se for usar só você, deixe **público** que não tem custo).
3. Suba estes 3 arquivos pra raiz do repositório: `index.html`, `style.css`, `app.js`
   (dá pra arrastar e soltar direto na página do GitHub, em "Add file" → "Upload files").
4. Vá em **Settings** → **Pages** (menu lateral).
5. Em "Source", selecione a branch `main` e a pasta `/ (root)`. Salve.
6. Espera uns 1-2 minutos e o GitHub te dá um link tipo:
   `https://seu-usuario.github.io/nome-do-repositorio/`
7. Pronto — esse link é o seu app, dá pra acessar do celular, favoritar, etc.

**Atenção:** como os dados ficam salvos no navegador (localStorage), se você acessar
esse link do celular e depois do computador, são dois "bancos" de dados separados,
cada aparelho guarda o seu. Não é uma sincronização entre aparelhos. Se algum dia
quiser isso, dá pra evoluir o projeto pra usar um banco online (tipo Firebase) — mas
aí muda a arquitetura.

## Sobre a senha de entrada

A tela de senha é só uma trava simples pra quem pegar o celular/PC não abrir de
cara — ela **não criptografa** os dados nem impede alguém com conhecimento técnico
de abrir o DevTools do navegador e ver os dados salvos. Não é um sistema de login
de verdade (não tem servidor, não tem múltiplos usuários). Serve bem pro caso de
"só eu uso, mas não quero que abra igual um app qualquer".

Se esquecer a senha: abra o DevTools do navegador (F12) → aba Console → rode:
```js
localStorage.removeItem('ca_auth')
```
e recarregue a página — ele vai pedir pra criar uma senha nova (os clientes e
cobranças continuam salvos, só a senha reseta).

## Estrutura dos arquivos

- `index.html` — estrutura da página
- `style.css` — visual (tema "livro-caixa": capa escura + páginas claras, valores
  em fonte mono, selos tipo carimbo pra status de pago/pendente/atrasado)
- `app.js` — toda a lógica: cadastro de clientes, cobranças, cálculo do painel,
  geração da mensagem e do link do WhatsApp, backup/importação

## Possíveis evoluções futuras

- Banco online (Firebase/Supabase) pra acessar de qualquer aparelho com os mesmos dados
- Geração de boleto/PIX de verdade (hoje é só a chave PIX em texto na mensagem)
- Envio automático (exige WhatsApp Business API, que é pago)
- Múltiplos usuários com login de verdade
