import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { styles } from './estilos.web';
import { ESP } from './tokens.web';
import { Button, desktop } from './ui.web';

/**
 * Os atalhos globais nas Definições do PC (entrega 2a do
 * docs/PLANO-OFFLINE-SOCIAL-DESCOBERTA-PC.md). NENHUM vem posto: cada linha
 * começa vazia e só ganha um atalho quando alguém carrega em "Set" e na tecla.
 *
 * A página só manda a tecla carregada; converter, validar e registar é do
 * processo principal (electron/atalhos.cjs). Enquanto se grava, os atalhos que
 * já existem saem, para a tecla chegar aqui.
 */

const ACOES: { id: string; nome: string }[] = [
  { id: 'tocar-pausa', nome: 'Play / pause' },
  { id: 'seguinte', nome: 'Next track' },
  { id: 'anterior', nome: 'Previous track' },
  { id: 'guardar', nome: 'Save current track' },
  { id: 'volume-mais', nome: 'Volume up' },
  { id: 'volume-menos', nome: 'Volume down' },
  { id: 'avancar-10', nome: 'Forward 10 seconds' },
  { id: 'recuar-10', nome: 'Back 10 seconds' },
  { id: 'shuffle', nome: 'Shuffle on / off' },
  { id: 'repeat', nome: 'Repeat mode' },
  { id: 'pesquisar', nome: 'Search' },
  { id: 'mostrar-janela', nome: 'Show / hide Duotone' },
  { id: 'mini-leitor', nome: 'Mini player' },
];

const NOMES = Object.fromEntries(ACOES.map((a) => [a.id, a.nome]));

function mensagemDoErro(r: { erro?: string; outra?: string; accelerator?: string }): string {
  if (r.erro === 'sem-modificador') return 'Use Ctrl, Alt or Win with the key: a key on its own would stop working in every app.';
  if (r.erro === 'em-uso-na-app') return `Already used for "${NOMES[r.outra ?? ''] ?? r.outra}".`;
  if (r.erro === 'em-uso-noutra-app') return `${r.accelerator ?? 'That shortcut'} is taken by another app.`;
  return 'That key cannot be a shortcut.';
}

const ehModificador = (code: string) => /^(Control|Alt|Shift|Meta|OS)(Left|Right)?$/.test(code);

export function AtalhosDoTeclado() {
  const ponte = typeof window !== 'undefined' ? window.duotoneDesktop : undefined;
  const [atalhos, setAtalhos] = useState<Record<string, string>>({});
  const [presos, setPresos] = useState<string[]>([]);
  const [aGravar, setAGravar] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<{ acao: string; texto: string; erro: boolean } | null>(null);

  useEffect(() => {
    void ponte?.lerAtalhos?.().then((r) => { setAtalhos(r.atalhos); setPresos(r.presos); }).catch(() => {});
  }, [ponte]);

  const parar = useCallback(() => {
    setAGravar(null);
    void ponte?.aGravarAtalho?.(false);
  }, [ponte]);

  // A tecla, apanhada na página inteira enquanto uma linha está a gravar.
  useEffect(() => {
    if (!aGravar || !ponte?.definirAtalho) return;
    const aoCarregar = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape' && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) { parar(); return; }
      if (ehModificador(e.code)) return;
      const acao = aGravar;
      void ponte.definirAtalho!(acao, {
        code: e.code, ctrlKey: e.ctrlKey, altKey: e.altKey, shiftKey: e.shiftKey, metaKey: e.metaKey,
      }).then((r) => {
        if (r.ok) {
          setAtalhos(r.atalhos ?? {});
          setPresos(r.presos ?? []);
          setMensagem(r.aviso ? { acao, texto: `This also blocks typing "${r.aviso}" (AltGr) in every app.`, erro: false } : null);
        } else {
          setMensagem({ acao, texto: mensagemDoErro(r), erro: true });
        }
        parar();
      }).catch(() => parar());
    };
    window.addEventListener('keydown', aoCarregar, true);
    return () => window.removeEventListener('keydown', aoCarregar, true);
  }, [aGravar, ponte, parar]);

  // Sair da página a meio de uma gravação repõe os atalhos.
  useEffect(() => () => { void ponte?.aGravarAtalho?.(false); }, [ponte]);

  if (!ponte?.lerAtalhos) return null;

  const gravar = (acao: string) => {
    setMensagem(null);
    setAGravar(acao);
    void ponte.aGravarAtalho?.(true);
  };
  const tirar = (acao: string) => {
    setMensagem(null);
    void ponte.definirAtalho?.(acao, null).then((r) => {
      if (r.ok) { setAtalhos(r.atalhos ?? {}); setPresos(r.presos ?? []); }
    });
  };

  return (
    <>
      <View style={styles.settingLine}>
        <Text style={[styles.settingDescription, { marginTop: 0 }]}>
          Shortcuts work in every app, even with Duotone in the tray. None are set until you set one.
        </Text>
      </View>
      {ACOES.map((a) => {
        const atual = atalhos[a.id];
        const gravando = aGravar === a.id;
        const msg = mensagem?.acao === a.id ? mensagem : null;
        return (
          <View key={a.id} style={styles.settingLine}>
            <View style={{ flex: 1, paddingRight: ESP.lg }}>
              <Text style={styles.settingLabel}>{a.nome}</Text>
              {msg ? (
                <Text style={[styles.settingDescription, msg.erro && { color: desktop.danger ?? '#f87171' }]}>{msg.texto}</Text>
              ) : presos.includes(a.id) ? (
                <Text style={[styles.settingDescription, { color: desktop.danger ?? '#f87171' }]}>
                  Another app took this shortcut. Set a different one.
                </Text>
              ) : null}
            </View>
            <Text style={styles.settingValue}>{gravando ? 'Press the keys… (Esc to cancel)' : atual ?? 'Not set'}</Text>
            {atual && !gravando ? <Button secondary onPress={() => tirar(a.id)}>Clear</Button> : null}
            <Button secondary onPress={() => (gravando ? parar() : gravar(a.id))}>{gravando ? 'Cancel' : atual ? 'Change' : 'Set'}</Button>
          </View>
        );
      })}
    </>
  );
}
