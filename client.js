window.__ModuleLoader__.load({
  id: 'dsh-plugin-doc-review',
  factory(require) {
    const React = require('react');
    const { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } = React;
    const h = React.createElement;

    const ID = 'dsh-plugin-doc-review/review';
    const NS = 'docReview';

    /**
     * Every route lives under the Harness' trusted `/api` channel, so the
     * browser's own credential reaches it and the trust fence lets it through.
     */
    // One route, one action: the Connection bridge matches a single /api
    // segment, so the action travels in the query.
    const API = {
      render: 'api/dsh-doc-review?action=render',
      textBlocks: 'api/dsh-doc-review?action=text-blocks',
      textOnly: 'api/dsh-doc-review?action=text-only',
      htmlText: 'api/dsh-doc-review?action=html-text',
      htmlApply: 'api/dsh-doc-review?action=html-apply',
      text: 'api/dsh-doc-review?action=text',
      apply: 'api/dsh-doc-review?action=apply',
      locate: 'api/dsh-doc-review?action=locate',
      selfcheck: 'api/dsh-doc-review?action=selfcheck',
      bench: 'api/dsh-doc-review?action=bench',
      editText: 'api/dsh-doc-review?action=edit-text',
      textSave: 'api/dsh-doc-review?action=text-save',
    };

    const CSS = [
      '.dr-root{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;position:relative;font-family:inherit}',
      '.dr-head{display:flex;gap:6px;align-items:center;padding:8px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);flex:0 0 auto}',
      '.dr-btn{flex:0 0 auto;height:28px;padding:0 11px;border-radius:7px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:12px;cursor:pointer;font-family:inherit;white-space:nowrap;display:inline-flex;align-items:center;gap:5px}',
      '.dr-btn:hover:not(:disabled){border-color:var(--dsw-alias-brand-primary)}',
      '.dr-btn.primary{background:var(--dsw-alias-brand-primary);color:#fff;border-color:transparent}',
      '.dr-btn.primary:hover:not(:disabled){filter:brightness(1.06)}',
      '.dr-btn:disabled{opacity:.45;cursor:default}',
      '.dr-btn.ghost{background:transparent;border-color:transparent;color:var(--dsw-alias-label-secondary)}',
      '.dr-btn.ghost:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',

      '.dr-status{flex:0 0 auto;display:flex;align-items:center;gap:6px;padding:6px 10px;font-size:11px;color:var(--dsw-alias-label-secondary);border-bottom:1px solid var(--dsw-alias-border-l1);overflow:hidden;white-space:nowrap}',
      '.dr-status em{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;font-style:normal}',
      '.dr-status.err{color:var(--dsw-alias-state-error-primary)}',
      '.dr-dot{flex:0 0 auto;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-success-primary)}',
      '.dr-status.err .dr-dot{background:var(--dsw-alias-state-error-primary)}',
      '.dr-status.busy .dr-dot{background:var(--dsw-alias-state-warn-primary)}',

      '.dr-scroll{flex:1 1 auto;min-height:0;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:12px;align-items:center;background:var(--dsw-alias-bg-layer-2)}',
      /* The page's width is one CSS variable, so a scale change repaints
         instead of rebuilding the whole page tree. */
      '.dr-page{position:relative;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.13);border-radius:3px;max-width:100%;width:100%;overflow:hidden;flex:0 0 auto}',
      '.dr-scroll.pages .dr-page{width:calc(var(--dr-zoom,1) * 100%);max-width:none}',
      /* `safe center` keeps a page readable once it is wider than the box:
         a plain `center` would push its left edge out of reach, because a
         scroll container cannot scroll to a negative offset. */
      '.dr-scroll.pages{--dr-zoom:1;align-items:safe center}',
      '@supports not (align-items: safe center){.dr-scroll.pages{align-items:flex-start}}',
      '.dr-page img{display:block;width:100%;height:auto;-webkit-user-drag:none}',
      '.dr-page iframe{display:block;width:100%;height:70vh;border:0;background:#fff}',
      '.dr-page .dr-ph{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:12px;background:#f8fafc}',
      /* The text layer: transparent runs over the page picture, so the
         human clicks the text they see. */
      '.dr-textlayer{position:absolute;inset:0;pointer-events:none;z-index:6}',
      '.dr-para{position:absolute;display:block;overflow:visible;white-space:pre-wrap;color:transparent;pointer-events:auto;cursor:text;border-radius:2px;line-height:1.25;transition:background .1s}',
      '.dr-para:hover{background:rgba(36,123,191,.14);box-shadow:0 0 0 1px rgba(36,123,191,.45)}',
      '.dr-para:focus{background:rgba(36,123,191,.12);box-shadow:0 0 0 2px var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary);outline:0}',
      '.dr-para.changed{background:rgba(217,119,6,.20);box-shadow:0 0 0 1px var(--dsw-alias-state-warn-primary)}',
      '.dr-para.changed:focus{color:var(--dsw-alias-label-primary)}',
      '.dr-para.focus{box-shadow:0 0 0 2px var(--dsw-alias-brand-primary)}',
      '.dr-para.pointed{background:rgba(36,123,191,.10)}',
      '.dr-para.selected{background:rgba(36,123,191,.18);box-shadow:0 0 0 2px var(--dsw-alias-brand-primary)}',
      /* 改字窗：浮在被选中的块旁边，字号是给人看的，不是页面上的百分数 */
      '.dr-pop{position:absolute;z-index:40;width:330px;padding:8px;border-radius:9px;background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l1);box-shadow:0 8px 28px rgba(15,23,42,.22);display:flex;flex-direction:column;gap:6px}',
      '.dr-popShield{position:absolute;inset:0;z-index:35;background:transparent}',
      '.dr-popHead{display:flex;align-items:center;gap:6px;font-size:10px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
      '.dr-popHead .dr-popTag{flex:0 0 auto;padding:0 5px;border-radius:4px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:9px;line-height:16px}',
      '.dr-popHead .dr-popSpacer{flex:1 1 auto}',
      '.dr-popOld{font-size:11px;line-height:1.5;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);border-radius:5px;padding:4px 6px;max-height:54px;overflow:auto;white-space:pre-wrap;word-break:break-word}',
      '.dr-popInput{width:100%;box-sizing:border-box;min-height:62px;max-height:210px;resize:vertical;border:1px solid var(--dsw-alias-brand-primary);border-radius:6px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.6;font-family:inherit;padding:6px 8px;outline:0}',
      '.dr-popInput:focus{box-shadow:0 0 0 2px rgba(36,123,191,.18)}',
      '.dr-popRow{display:flex;align-items:center;gap:6px}',
      '.dr-popHint{flex:1 1 auto;font-size:10px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dr-popBtn{flex:0 0 auto;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-radius:6px;padding:3px 10px;font-size:11px;cursor:pointer;font-family:inherit}',
      '.dr-popBtn:hover{background:var(--dsw-alias-bg-layer-1)}',
      '.dr-popBtn.primary{background:var(--dsw-alias-brand-primary);border-color:transparent;color:#fff}',
      '.dr-popBtn.primary:hover{filter:brightness(1.08)}',
      '.dr-popBtn:disabled{opacity:.4;cursor:default}',
      /* PPT / Word 文字块在“看文字”视图里也标出这是可整块修改的 */
      '.dr-paraRow.sel{border-left-color:var(--dsw-alias-brand-primary)!important;background:rgba(36,123,191,.06)}',
      '.dr-zoomMenuWrap{position:relative;display:flex;height:100%}',
      '.dr-zoomCaret{margin-left:3px;opacity:.65;font-size:9px}',
      '.dr-zoomMenu{position:absolute;top:calc(100% + 5px);right:0;z-index:40;min-width:112px;padding:4px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 8px 24px rgba(0,0,0,.18);display:flex;flex-direction:column;gap:1px}',
      '.dr-zoomItem{border:0;background:none;color:var(--dsw-alias-label-primary);font-size:12px;font-family:inherit;text-align:left;padding:5px 9px;border-radius:5px;cursor:pointer;font-variant-numeric:tabular-nums}',
      '.dr-zoomItem:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.dr-zoomItem.on{color:var(--dsw-alias-brand-primary);font-weight:600}',
      '.dr-zoomSplit{height:1px;margin:3px 4px;background:var(--dsw-alias-border-l1)}',
      '.dr-zoom{display:flex;align-items:center;gap:0;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;overflow:hidden;height:28px;flex:0 0 auto}',
      '.dr-zoomBtn{width:26px;height:100%;border:0;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:15px;line-height:1;cursor:pointer;font-family:inherit;transition:background .12s}',
      '.dr-zoomBtn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-1)}',
      '.dr-zoomBtn:active:not(:disabled){background:var(--dsw-alias-bg-layer-3,var(--dsw-alias-bg-layer-1))}',
      '.dr-zoomBtn:disabled{opacity:.38;cursor:default}',
      '.dr-zoomValue{min-width:50px;height:100%;border:0;border-left:1px solid var(--dsw-alias-border-l1);border-right:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:11px;cursor:pointer;font-family:inherit;font-variant-numeric:tabular-nums;transition:color .12s,background .12s}',
      '.dr-zoomValue:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1)}',
      '.dr-zoomValue.fit{color:var(--dsw-alias-brand-primary)}',
      '.dr-zoomInput{width:50px;height:100%;border:0;border-left:1px solid var(--dsw-alias-border-l1);border-right:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:11px;font-family:inherit;font-variant-numeric:tabular-nums;text-align:center;outline:0;padding:0}',
      '.dr-zoomInput:focus{box-shadow:inset 0 0 0 1px var(--dsw-alias-brand-primary)}',
      '.dr-fitBtn{width:auto;min-width:26px;padding:0 7px;font-size:10px;letter-spacing:.02em}',
      /* 缩放时页面跟着尺寸走，不要逐帧重排整棵树 */
      '.dr-page{will-change:width}',
      /* 缩放后的横向滚动容器：保持内容居中，且不裁掉溢出部分 */
      '.dr-scroll{scroll-behavior:auto;overscroll-behavior:contain}',
      '.dr-scroll.pinching{cursor:grabbing}',
      /* 缩放百分比出现时的小提示条 */
      '.dr-zoomToast{position:absolute;left:50%;top:10px;transform:translateX(-50%);z-index:30;padding:3px 12px;border-radius:999px;background:rgba(17,24,39,.82);color:#fff;font-size:11px;font-variant-numeric:tabular-nums;pointer-events:none;opacity:0;transition:opacity .18s}',
      '.dr-zoomToast.on{opacity:1}',
      '.dr-plain{width:100%;min-height:60vh;border:0;padding:14px 16px;background:transparent;color:var(--dsw-alias-label-primary);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;line-height:1.65;resize:none;outline:0;tab-size:2}',
      '.dr-plain:focus{background:var(--dsw-alias-bg-layer-1)}',
      '.dr-shape{position:absolute;border-radius:3px;pointer-events:auto;cursor:pointer;outline:1px dashed rgba(36,123,191,.5);outline-offset:1px;transition:background .12s,outline-color .12s}',
      '.dr-shape:hover{background:rgba(36,123,191,.10);outline-color:var(--dsw-alias-brand-primary)}',
      '.dr-shape.selected{background:rgba(36,123,191,.16);outline:2px solid var(--dsw-alias-brand-primary)}',
      '.dr-shape.changed{background:rgba(217,119,6,.16);outline-color:var(--dsw-alias-state-warn-primary)}',
      '.dr-shapeTag{position:absolute;left:0;top:-15px;padding:1px 5px;border-radius:3px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:9px;white-space:nowrap;pointer-events:none;opacity:0;transition:opacity .12s}',
      '.dr-shape:hover .dr-shapeTag,.dr-shape.selected .dr-shapeTag{opacity:1}',
      '.dr-paras{display:flex;flex-direction:column;gap:6px;padding:10px 12px}',
      /* A Word document is read as one continuous text: every paragraph in
         the same face, the way a text file is. */
      '.dr-paras.plain .dr-paraInput{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Courier New",monospace;font-size:12.5px;line-height:1.75}',
      '.dr-paras.plain .dr-paraRow{gap:0}',
      '.dr-paras.plain .dr-paraHead{min-width:44px;font-family:inherit}',
      /* A slide deck keeps its own shape: the paragraphs of a slide are
         shown together, under the slide they belong to. */
      '.dr-paras.slides{gap:2px}',
      '.dr-paras.slides .dr-paraRow{border-left:2px solid var(--dsw-alias-border-l1);padding-left:8px;margin-left:0}',
      '.dr-paras.slides .dr-paraRow.changed{border-left-color:var(--dsw-alias-state-warn-primary)}',
      '.dr-paras.slides .dr-paraInput{font-family:inherit;font-size:13px;line-height:1.6}',
      '.dr-paras.slides .dr-paraPage{margin:10px 0 4px;padding:3px 8px;border-radius:4px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:10px;letter-spacing:.04em}',
      '.dr-paraRow{display:flex;align-items:flex-start;gap:6px}',
      '.dr-paraHead{flex:0 0 auto;min-width:26px;padding:5px 4px;border-radius:4px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:10px;text-align:center}',
      '.dr-paraInput{flex:1 1 auto;min-height:26px;padding:5px 7px;border:1px solid transparent;border-radius:5px;background:transparent;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:13px;line-height:1.6;resize:vertical;outline:0}',
      '.dr-paraInput:hover{border-color:var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1)}',
      '.dr-paraInput:focus{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-1)}',
      '.dr-paraRow.changed .dr-paraInput{border-color:var(--dsw-alias-state-warn-primary);background:rgba(217,119,6,.10)}',
      '.dr-num{position:absolute;top:8px;right:8px;font-size:10px;color:#6b7280;background:rgba(255,255,255,.9);padding:1px 7px;border-radius:5px;box-shadow:0 1px 2px rgba(0,0,0,.08);pointer-events:none}',

      /* The annotation layer floats above the rendered pages and takes every
         pointer event, so the document underneath is never disturbed. */
      '.dr-layer{position:absolute;inset:0;z-index:5;cursor:crosshair;pointer-events:auto}',
      '.dr-box{position:absolute;border:2px solid var(--dsw-alias-brand-primary);background:rgba(36,123,191,.12);box-sizing:border-box;border-radius:2px;pointer-events:none}',
      '.dr-box.must-fix{border-color:var(--dsw-alias-state-error-primary);background:rgba(220,38,38,.10)}',
      '.dr-box.suggest{border-color:var(--dsw-alias-state-warn-primary);background:rgba(217,119,6,.10)}',
      '.dr-box.draft{border-style:dashed;background:rgba(36,123,191,.05)}',
      '.dr-box b{position:absolute;top:-17px;left:-2px;font-size:10px;line-height:15px;padding:0 5px;border-radius:5px;background:var(--dsw-alias-brand-primary);color:#fff;white-space:nowrap;max-width:180px;overflow:hidden;text-overflow:ellipsis;font-weight:600}',
      '.dr-box.must-fix b{background:var(--dsw-alias-state-error-primary)}',
      '.dr-box.suggest b{background:var(--dsw-alias-state-warn-primary)}',

      '.dr-panel{flex:0 0 auto;border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);max-height:38%;display:flex;flex-direction:column}',
      '.dr-panelHead{display:flex;gap:6px;align-items:center;padding:6px 10px;font-size:11px;color:var(--dsw-alias-label-secondary);border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.dr-panelHead .dr-count{margin-left:auto;font-variant-numeric:tabular-nums}',
      '.dr-list{flex:1 1 auto;min-height:0;overflow:auto;padding:6px 10px 10px}',
      '.dr-note{display:flex;gap:7px;align-items:flex-start;padding:6px 0;border-bottom:1px dashed var(--dsw-alias-border-l1)}',
      '.dr-note .dr-idx{flex:0 0 auto;width:17px;height:17px;border-radius:50%;background:var(--dsw-alias-brand-primary);color:#fff;font-size:10px;display:flex;align-items:center;justify-content:center;margin-top:1px;font-weight:600}',
      '.dr-note .dr-body{flex:1 1 auto;min-width:0}',
      '.dr-note .dr-meta{font-size:10px;color:var(--dsw-alias-label-secondary);margin-bottom:3px;display:flex;gap:6px;align-items:center;flex-wrap:wrap}',
      '.dr-note textarea{width:100%;box-sizing:border-box;min-height:40px;resize:vertical;border-radius:6px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:12px;font-family:inherit;padding:5px 7px;line-height:1.5}',
      '.dr-note textarea:focus{outline:0;border-color:var(--dsw-alias-brand-primary)}',
      '.dr-note .dr-del{flex:0 0 auto;border:none;background:none;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:15px;line-height:1;padding:2px 3px;border-radius:4px}',
      '.dr-note .dr-del:hover{color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-bg-layer-2)}',
      '.dr-diff{display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;font-size:12px;line-height:1.5}',
      '.dr-diffOld{color:var(--dsw-alias-state-error-primary);text-decoration:line-through;opacity:.8}',
      '.dr-diffArrow{color:var(--dsw-alias-label-secondary)}',
      '.dr-diffNew{color:var(--dsw-alias-state-success-primary);font-weight:600}',
      '.dr-kind{border:1px solid var(--dsw-alias-border-l1);border-radius:4px;padding:0 5px;font-size:9px;line-height:15px;cursor:pointer;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary);font-family:inherit}',
      '.dr-kind.on{background:var(--dsw-alias-brand-primary);color:#fff;border-color:transparent}',
      '.dr-kind.on.must-fix{background:var(--dsw-alias-state-error-primary)}',
      '.dr-kind.on.suggest{background:var(--dsw-alias-state-warn-primary)}',

      '.dr-blocks{flex:1 1 auto;min-height:0;overflow:auto;padding:8px 10px}',
      '.dr-editor{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;overflow:hidden}',
      '.dr-outline{flex:0 1 auto;max-height:32%;overflow:auto;border-bottom:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);padding:4px 0}',
      '.dr-outlineTitle{font-size:10px;color:var(--dsw-alias-label-secondary);padding:3px 10px 4px}',
      '.dr-outlineItem{display:block;width:100%;text-align:left;border:0;background:none;color:var(--dsw-alias-label-primary);font-size:12px;font-family:inherit;padding:3px 10px;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dr-outlineItem:hover{background:var(--dsw-alias-bg-layer-1)}',
      '.dr-outlineItem.on{background:var(--dsw-alias-brand-primary);color:#fff}',
      '.dr-search{flex:0 0 auto;display:flex;gap:6px;align-items:center;padding:6px 10px;border-bottom:1px solid var(--dsw-alias-border-l1)}',
      '.dr-searchInput{flex:1 1 auto;min-width:0;height:24px;padding:0 8px;border-radius:6px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:12px;font-family:inherit}',
      '.dr-searchInput:focus{outline:0;border-color:var(--dsw-alias-brand-primary)}',
      '.dr-searchCount{flex:0 0 auto;font-size:10px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
      '.dr-block.pointed{border-color:var(--dsw-alias-state-warn-primary)}',
      '.dr-block.focus{box-shadow:0 0 0 2px var(--dsw-alias-brand-primary)}',
      '.dr-block .dr-badge{flex:0 0 auto;font-size:9px;line-height:14px;padding:0 4px;border-radius:4px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-weight:600}',
      '.dr-jump{flex:0 0 auto;border:1px solid var(--dsw-alias-border-l1);border-radius:4px;padding:0 4px;font-size:9px;line-height:14px;cursor:pointer;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-brand-primary);font-family:inherit}',
      '.dr-jump:hover{background:var(--dsw-alias-brand-primary);color:#fff;border-color:transparent}',
      '.dr-block{border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-layer-1);margin-bottom:7px;overflow:hidden}',
      '.dr-block.changed{border-color:var(--dsw-alias-brand-primary)}',
      '.dr-block .dr-blockHead{display:flex;align-items:center;gap:6px;padding:4px 8px;background:var(--dsw-alias-bg-layer-2);font-size:10px;color:var(--dsw-alias-label-secondary)}',
      '.dr-block .dr-blockHead b{font-weight:600;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dr-block .dr-mark{margin-left:auto;color:var(--dsw-alias-brand-primary);font-size:10px}',
      '.dr-block textarea{display:block;width:100%;box-sizing:border-box;min-height:32px;resize:vertical;border:0;border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:12px;font-family:inherit;padding:6px 8px;line-height:1.6}',
      '.dr-block textarea:focus{outline:0}',
      '.dr-empty{flex:1 1 auto;display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary);font-size:12px;padding:24px;text-align:center}',
      '.dr-toolbar{display:flex;gap:6px;align-items:center;padding:7px 10px;border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);flex:0 0 auto}',
      '.dr-hint{flex:1 1 auto;min-width:0;font-size:10px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    ].join('\n');

    function Style() {
      return h('style', { 'data-doc-review': 'v3' }, CSS);
    }

    function ReviewIcon(props) {
      const size = typeof props?.size === 'number' ? props.size : 16;
      return h('svg', {
        viewBox: '0 0 24 24', width: size, height: size, fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true, style: { display: 'block' },
      },
        h('path', { d: 'M6 3h8l4 4v14H6z' }),
        h('path', { d: 'M14 3v4h4' }),
        h('path', { d: 'M9 12h6M9 16h4' }),
        h('rect', { x: '11', y: '14', width: '9', height: '7', rx: '1', strokeWidth: 1.4 })
      );
    }

    const KINDS = [
      { id: 'must-fix', label: '必改' },
      { id: 'suggest', label: '建议' },
      { id: 'question', label: '疑问' },
    ];

    /**
     * The absolute path behind a preview tab's resource address.
     *
     * The official previewer addresses a file as
     * `dsh-resource://file/session/<id>/<path>` (or `…/absolute/<path>`). A
     * session-scoped address carries a workspace-relative path, so it is
     * returned as-is and the Host resolves it against the session's working
     * directory; an absolute address is decoded here.
     */
    function absolutePathOf(address) {
      if (typeof address !== 'string') return '';
      const prefix = 'dsh-resource://file/';
      if (!address.startsWith(prefix)) return '';
      const end = address.search(/[?#]/);
      const rest = address.slice(prefix.length, end === -1 ? undefined : end).split('/');
      const scope = rest[0];
      const segments = scope === 'session' ? rest.slice(2) : rest.slice(1);
      if (segments.length === 0) return '';
      const decoded = segments.map((segment) => {
        try { return decodeURIComponent(segment); } catch { return segment; }
      });
      if (scope === 'absolute') {
        // A Windows path keeps its drive as its own segment (`C:`), so the
        // first segment is the drive and the rest is the path.
        if (/^[A-Za-z]:$/.test(decoded[0] ?? '')) return decoded.join('/');
        // A UNC path starts with an empty segment.
        if (decoded[0] === '' && decoded.length > 1) return `//${decoded.slice(1).join('/')}`;
        // A whole path may also arrive in one segment.
        if (decoded.length === 1 && /^[A-Za-z]:[\/]/.test(decoded[0])) return decoded[0];
        return `/${decoded.join('/')}`;
      }
      return decoded.join('/');
    }

    /** The session a workspace-relative address belongs to. */
    function sessionOf(address) {
      if (typeof address !== 'string') return '';
      const prefix = 'dsh-resource://file/session/';
      if (!address.startsWith(prefix)) return '';
      const end = address.search(/[?#]/);
      const rest = address.slice(prefix.length, end === -1 ? undefined : end);
      const id = rest.split('/')[0];
      try { return decodeURIComponent(id); } catch { return id; }
    }

    async function call(path, options) {
      const response = await fetch(`/${path}`, { cache: 'no-store', ...options });
      // A failure must say what actually came back: a plain-text body from
      // a route that does not exist is the most common cause, and a bare
      // "Unexpected token" hides it.
      const text = await response.text();
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        const detail = text.trim().slice(0, 120);
        void report(`kind=bad-response&status=${String(response.status)}&url=${encodeURIComponent(`/${path}`)}&body=${encodeURIComponent(detail)}`);
        // The message names the route and what came back, so a failure is
        // readable instead of a parser complaint.
        throw new Error(`请求 ${`/${path}`.split('?')[0]} 失败（${String(response.status)}）：${detail === '' ? '空响应' : detail}`);
      }
      if (payload?.ok !== true) {
        void report(`kind=rejected&status=${String(response.status)}&url=${encodeURIComponent(`/${path}`)}&message=${encodeURIComponent(String(payload?.error?.message ?? ''))}`);
        throw new Error(payload?.error?.message ?? `HTTP ${String(response.status)}`);
      }
      void report(`kind=ok&url=${encodeURIComponent(`/${path}`)}`);
      return payload;
    }

    /** Tell the Host what the browser saw, so a failure is diagnosable. */
    function report(fields) {
      return fetch('/api/dsh-doc-review?action=report', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(fields),
      }).catch(() => {});
    }

    /**
     * One annotation over one page.
     *
     * The rectangle is stored in percent of the page box, so it survives a
     * resize or a zoom. `locatedBlocks` keeps the paragraphs the note points
     * at, so a rewritten document can be re-matched.
     */
    function makeNote(page, rect, kind) {
      return {
        id: `n${String(Date.now())}-${Math.random().toString(36).slice(2, 7)}`,
        page: page.index,
        rect,
        note: '',
        kind,
        locatedBlocks: undefined,
      };
    }

    /**
     * The review body.
     *
     * It renders the document itself (not a second window) and layers a
     * transparent annotation surface on top of it. The surface takes every
     * pointer event, so the rendered pages keep their own scrolling.
     */
    /* ------------------------------------------------------------------ *
     * Zoom: one controller for every way a human changes the page scale.
     *
     * The value is a plain factor (1 = the page's default width). The
     * controller answers four inputs — the buttons, the keyboard, the wheel
     * with a modifier, and a two-finger pinch — and it keeps the point under
     * the cursor still while the scale changes, which is what the eye expects.
     * ------------------------------------------------------------------ */

    const ZOOM_MIN = 0.25;
    const ZOOM_MAX = 3;
    // The sizes the buttons step through, so +/- always looks the same.
    const ZOOM_STOPS = [0.25, 0.4, 0.5, 0.67, 0.75, 0.9, 1, 1.25, 1.5, 1.75, 2, 2.5, 3];

    const clampZoom = (value) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));

    /** The next stop above/below `value`, never skipping past it. */
    const stepZoom = (value, direction) => {
      if (direction > 0) {
        for (const stop of ZOOM_STOPS) if (stop > value + 1e-6) return stop;
        return ZOOM_MAX;
      }
      for (let index = ZOOM_STOPS.length - 1; index >= 0; index -= 1) {
        if (ZOOM_STOPS[index] < value - 1e-6) return ZOOM_STOPS[index];
      }
      return ZOOM_MIN;
    };

    function useZoom(scrollRef, ready) {
      const [zoom, setZoomRaw] = useState(1);
      // The pinch handler reads the live factor from inside a stale closure,
      // so it is declared before any effect that captures it.
      const zoomRef = useRef(1);
      // 'manual' while the human sets it, 'width' / 'page' while it follows
      // the window. A fitted zoom is recomputed on every resize.
      const [fit, setFit] = useState('manual');
      const [toast, setToast] = useState(false);
      // The size the last fit was computed for, so a resize can tell whether
      // anything actually changed.
      const fitBox = useRef({ width: 0, height: 0, pageW: 1, pageH: 1, zoom: 1 });
      const toastTimer = useRef(null);

      // The pinch handler opens with the factor it should scale *from*, and
      // it lives in a closure created once, so it reads the live value here.
      zoomRef.current = zoom;

      /** Show the factor briefly, the way a viewer does while you scale. */
      const flash = useCallback(() => {
        setToast(true);
        if (toastTimer.current !== null) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => { setToast(false); }, 700);
      }, []);

      const setZoom = useCallback((next) => {
        setZoomRaw((previous) => {
          const value = clampZoom(typeof next === 'function' ? next(previous) : next);
          return Math.abs(value - previous) < 1e-6 ? previous : value;
        });
      }, []);

      /** A scale the human chose themselves. */
/**
       * Pin a point of the page, so a scale keeps it where it is.
       *
       * The point is remembered as a share of the scrollable content; the
       * share does not change when the pages are redrawn at another width.
       */
      const rememberAnchor = useCallback((event) => {
        const box = scrollRef.current;
        if (box === null) return;
        const rect = box.getBoundingClientRect();
        // The cursor, as a share of the visible area. 0.5/0.5 when the scale
        // came from a button rather than the wheel.
        let ratioX = 0.5;
        let ratioY = 0.5;
        if (event !== undefined && event.clientX !== undefined) {
          ratioX = Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width)));
          ratioY = Math.min(1, Math.max(0, (event.clientY - rect.top) / Math.max(1, rect.height)));
        }
        anchor.current = {
          ratioX: ratioX,
          ratioY: ratioY,
          // Where that point sits inside the scrollable content (0..1).
          x: (box.scrollLeft + rect.width * ratioX) / Math.max(1, box.scrollWidth),
          y: (box.scrollTop + rect.height * ratioY) / Math.max(1, box.scrollHeight),
        };
      }, [scrollRef]);

      /**
       * Put a scale on the element itself, keeping the anchored point still.
       *
       * The variable drives every page's width, so writing it here scales the
       * whole strip without a React render — which matters because a trackpad
       * pinch sends dozens of small steps a second, and re-rendering ten pages
       * and every paragraph box for each of them is what made it feel slow.
       */
      const paintZoom = useCallback((value) => {
        const box = scrollRef.current;
        if (box === null) return;
        const pinned = anchor.current;
        box.style.setProperty('--dr-zoom', String(value));
        if (pinned === null) return;
        // The browser has laid the pages out at the new width by the time the
        // scroll size is read, so the anchored point can be put back.
        const rect = box.getBoundingClientRect();
        const targetX = pinned.x * box.scrollWidth - rect.width * pinned.ratioX;
        const targetY = pinned.y * box.scrollHeight - rect.height * pinned.ratioY;
        box.scrollLeft = Math.max(0, targetX);
        box.scrollTop = Math.max(0, targetY);
      }, [scrollRef]);

      /**
       * Scale now, and tell React once the gesture has settled.
       *
       * `event` is the pointer the scale should hold in place; a button passes
       * nothing, which holds the middle of the view instead.
       */
      const commitTimer = useRef(null);
      const zoomLive = useCallback((next, event) => {
        const value = clampZoom(typeof next === 'function' ? next(zoomRef.current) : next);
        if (Math.abs(value - zoomRef.current) < 1e-4) return;
        setFit('manual');
        rememberAnchor(event);
        zoomRef.current = value;
        paintZoom(value);
        if (commitTimer.current !== null) clearTimeout(commitTimer.current);
        commitTimer.current = setTimeout(() => {
          commitTimer.current = null;
          // The scroll position was already moved by `paintZoom`, so the
          // committed render must not move it a second time.
          anchor.current = null;
          setZoomRaw(value);
          flash();
        }, 110);
      }, [paintZoom, rememberAnchor, setFit, flash]);

      // A pending commit is dropped when the panel goes away.
      useEffect(() => () => {
        if (commitTimer.current !== null) clearTimeout(commitTimer.current);
      }, []);


      const zoomTo = useCallback((next) => {
        zoomLive(next);
      }, [zoomLive]);

      const zoomStep = useCallback((direction) => {
        zoomLive((previous) => stepZoom(previous, direction));
      }, [zoomLive]);

      const zoomReset = useCallback(() => {
        setFit('manual');
        setZoomRaw(1);
        flash();
      }, [flash]);

      /* ---- fitting ---- */

      /** How big one page is at scale 1, in CSS pixels. */
      const pageSize = useRef({ width: 0, height: 0 });

      const measureFit = useCallback((mode) => {
        const box = scrollRef.current;
        if (box === null) return;
        const page = pageSize.current;
        if (page.width <= 0 || page.height <= 0) return;
        // 12px padding on each side, 12px gap between pages, a 10px slack so a
        // fitted page never sits flush against the edge.
        const availW = Math.max(80, box.clientWidth - 24 - 10);
        const availH = Math.max(80, box.clientHeight - 24 - 10);
        const byWidth = availW / page.width;
        const byPage = Math.min(byWidth, availH / page.height);
        const value = clampZoom(mode === 'width' ? byWidth : byPage);
        fitBox.current = {
          width: box.clientWidth, height: box.clientHeight,
          pageW: page.width, pageH: page.height, zoom: value,
        };
        setZoomRaw(value);
      }, [scrollRef]);


      const zoomFit = useCallback((mode) => {
        setFit(mode);
        // Let the next frame measure: the mode change may have altered the
        // scroll box (a fitted page has no scrollbar).
        requestAnimationFrame(() => { measureFit(mode); });
        flash();
      }, [measureFit, flash]);

      /** Called by the page renderer once it knows the natural page size. */
      const setPageSize = useCallback((width, height) => {
        const changed = Math.abs(pageSize.current.width - width) > 0.5
          || Math.abs(pageSize.current.height - height) > 0.5;
        pageSize.current = { width: width, height: height };
        if (changed && fit !== 'manual') measureFit(fit);
      }, [fit, measureFit]);

      /* ---- keep the point under the cursor still ---- */

      /**
       * Hold the reading position across a scale change.
       *
       * Everything is measured in *content* fractions: how far into the
       * document the viewport's left/top edge sits, as a share of the whole
       * scrollable extent. That stays true whatever the scale, so restoring
       * it puts the same words under the same pixel.
       */
      const anchor = useRef(null);

      /**
      }, [scrollRef]);

      useLayoutEffect(() => {
        const box = scrollRef.current;
        const pinned = anchor.current;
        if (box === null || pinned === null) return;
        // Restore after the browser has laid the pages out at the new width.
        const rect = box.getBoundingClientRect();
        const targetX = pinned.x * box.scrollWidth - rect.width * pinned.ratioX;

      /* ---- wheel / pinch ---- */

      useEffect(() => {
        const box = scrollRef.current;
        if (box === null) return undefined;

        const onWheel = (event) => {
          // Ctrl/⌘ + wheel is the browser's own zoom gesture, and a trackpad
          // pinch arrives as ctrlKey wheel events — both mean "scale the page".
          if (!event.ctrlKey && !event.metaKey) return;
          // Never let it zoom the whole window instead.
          event.preventDefault();
          // A pinch sends many small deltas; the wheel sends three big ones.
          const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1;
          const delta = event.deltaY * unit;
          const factor = Math.exp(-delta * 0.0016);
          zoomLive((previous) => previous * factor, event);
        };

        // Safari's pinch arrives as gesture events, not wheel.
        let gestureStartZoom = 1;
        const onGestureStart = (event) => {
          event.preventDefault();
          gestureStartZoom = zoomRef.current;
          rememberAnchor(event);
        };
        const onGestureChange = (event) => {
          event.preventDefault();
          zoomLive(gestureStartZoom * event.scale, event);
        };
        const onGestureEnd = (event) => { event.preventDefault(); flash(); };

        box.addEventListener('wheel', onWheel, { passive: false });
        box.addEventListener('gesturestart', onGestureStart, { passive: false });
        box.addEventListener('gesturechange', onGestureChange, { passive: false });
        box.addEventListener('gestureend', onGestureEnd, { passive: false });
        return () => {
          box.removeEventListener('wheel', onWheel);
          box.removeEventListener('gesturestart', onGestureStart);
          box.removeEventListener('gesturechange', onGestureChange);
          box.removeEventListener('gestureend', onGestureEnd);
        };
        // `ready` flips once the container is really in the document.
      }, [scrollRef, ready, zoomLive, flash]);

      /* ---- keyboard ---- */

      useEffect(() => {
        const onKey = (event) => {
          if (!event.ctrlKey && !event.metaKey) return;
          const target = event.target;
          // Never steal a keystroke from a field the human is typing in.
          const tag = target !== null && target !== undefined ? String(target.tagName ?? '') : '';
          if (tag === 'INPUT' || tag === 'TEXTAREA' || (target !== null && target !== undefined && target.isContentEditable === true)) {
            return;
          }
          if (event.key === '=' || event.key === '+') {
            event.preventDefault(); zoomStep(1);
          } else if (event.key === '-' || event.key === '_') {
            event.preventDefault(); zoomStep(-1);
          } else if (event.key === '0') {
            event.preventDefault(); zoomReset();
          } else if (event.key === '1') {
            event.preventDefault(); zoomFit('width');
          } else if (event.key === '2') {
            event.preventDefault(); zoomFit('page');
          }
        };
        window.addEventListener('keydown', onKey);
        return () => { window.removeEventListener('keydown', onKey); };
      }, [zoomStep, zoomReset, zoomFit]);

      /* ---- follow the window while fitted ---- */

      useEffect(() => {
        if (fit === 'manual') return undefined;
        const box = scrollRef.current;
        if (box === null) return undefined;
        let frame = 0;
        const observer = new ResizeObserver(() => {
          if (frame !== 0) cancelAnimationFrame(frame);
          frame = requestAnimationFrame(() => {
            const last = fitBox.current;
            if (Math.abs(box.clientWidth - last.width) < 2 && Math.abs(box.clientHeight - last.height) < 2) return;
            measureFit(fit);
          });
        });
        observer.observe(box);
        return () => {
          if (frame !== 0) cancelAnimationFrame(frame);
          observer.disconnect();
        };
      }, [fit, measureFit, scrollRef, ready]);

      useEffect(() => () => {
        if (toastTimer.current !== null) clearTimeout(toastTimer.current);
      }, []);

      return {
        zoom: zoom,
        zoomRef: zoomRef,
        fit: fit,
        toast: toast,
        setZoom: setZoom,
        zoomTo: zoomTo,
        zoomStep: zoomStep,
        zoomReset: zoomReset,
        zoomFit: zoomFit,
        setPageSize: setPageSize,
        rememberAnchor: rememberAnchor,
        min: ZOOM_MIN,
        max: ZOOM_MAX,
      };
    }

    /**
     * The edit window for one selected text block.
     *
     * For a slide the block is a whole shape, so every line of the window is
     * one of its paragraphs; for a page it is a single paragraph.
     *
     * A block on a page is drawn at whatever scale the page is shown at, so
     * its own type can be a few pixels tall. Editing it in place is therefore
     * fiddly; this window shows the same words in a readable size, keeps the
     * original above it for comparison, and hands back one whole-string edit.
     */
    function EditPopover(props) {
      const { block, value, onChange, onCommit, onCancel, anchor, width } = props;
      const boxRef = useRef(null);
      const inputRef = useRef(null);

      useEffect(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, []);

      // Escape closes the window from anywhere, including when the pointer
      // has drifted off it — the human expects Esc to mean "never mind".
      useEffect(() => {
        const onKey = (event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          event.stopPropagation();
          onCancel();
        };
        document.addEventListener('keydown', onKey, true);
        return () => { document.removeEventListener('keydown', onKey, true); };
      }, [onCancel]);

      // Keep the window inside the page area: it opens below the block unless
      // that would push it off, in which case it opens above.
      const popStyle = useMemo(() => {
        const POP_W = 330;
        const POP_H = 190;
        const pageW = width > 0 ? width : 1;
        const leftPct = anchor.left + anchor.width / 2;
        // 用百分比定位，页面缩放时窗口跟着走
        let left = Math.max(4, Math.min(96, leftPct));
        let side = anchor.top + anchor.height + 2;
        let placeAbove = false;
        if (side + (POP_H / 900) * 100 > 92) {
          placeAbove = true;
          side = anchor.top - 2;
        }
        return {
          left: `${String(left)}%`,
          top: `${String(side)}%`,
          transform: `translate(-50%, ${placeAbove ? '-100%' : '0'})`,
          maxWidth: `calc(100% - ${String(pageW > 0 ? 16 : 8)}px)`,
        };
      }, [anchor, width]);

      const dirty = value !== block.text;

      return h('div', {
        className: 'dr-pop',
        ref: boxRef,
        style: popStyle,
        // 点窗里不触发页面上的框选/取消
        onPointerDown: (event) => { event.stopPropagation(); },
        onClick: (event) => { event.stopPropagation(); },
        onDoubleClick: (event) => { event.stopPropagation(); },
        // Marked so the page-wide handler knows a click is "inside".
        'data-dr-pop': '1',
      },
        h('div', { className: 'dr-popHead' },
          h('span', { className: 'dr-popTag' }, block.id),
          h('span', null, `第 ${String(block.page)} 页`),
          block.heading !== undefined && typeof block.heading === 'number'
            ? h('span', { className: 'dr-popTag' }, `H${String(block.heading)}`)
            : null,
          h('span', { className: 'dr-popSpacer' }),
          h('span', null, dirty ? '已改动' : '未改动')
        ),
        h('div', { className: 'dr-popOld', title: block.text }, block.text),
        h('textarea', {
          className: 'dr-popInput',
          ref: inputRef,
          value: value,
          spellCheck: false,
          onChange: (event) => { onChange(event.target.value); },
          onKeyDown: (event) => {
            event.stopPropagation();
            if (event.key === 'Escape') {
              event.preventDefault();
              onCancel();
            } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              onCommit();
            }
          },
        }),
        h('div', { className: 'dr-popRow' },
          h('span', { className: 'dr-popHint' }, 'Ctrl+Enter 应用 · Esc 取消'),
          h('button', {
            className: 'dr-popBtn',
            onClick: onCancel,
          }, '取消'),
          h('button', {
            className: 'dr-popBtn primary',
            disabled: !dirty,
            onClick: onCommit,
          }, '应用')
        )
      );
    }

    /**
     * The paragraphs of a document, each one editable in place.
     *
     * A Word document is read as one continuous text, every paragraph in the
     * same face, the way a text file is. A slide deck keeps its own shape:
     * its paragraphs are shown slide by slide, in the order they appear.
     */
    function Paragraphs(props) {
      const { blocks, pending, style, onChange } = props;

      /** One paragraph, as a field the human types in. */
      const row = (block) => {
        const changed = pending[block.id];
        const shown = changed !== undefined ? changed.newText : block.text;
        return h('div', {
          key: block.id,
          className: `dr-paraRow${changed !== undefined ? ' changed' : ''}`,
          'data-dr-page': String(block.page),
        },
          typeof block.heading === 'number'
            ? h('div', { className: 'dr-paraHead' }, `H${String(block.heading)}`)
            : null,
          h('textarea', {
            className: 'dr-paraInput',
            value: shown,
            rows: Math.max(1, Math.ceil(String(shown).length / 42)),
            spellCheck: false,
            onChange: (event) => onChange(block.id, event.target.value, block),
          })
        );
      };

      if (style === 'slides') {
        const pages = [...new Set(blocks.map((block) => block.page))];
        return h('div', { className: 'dr-paras slides' },
          pages.map((page) => h('div', { key: `page-${String(page)}` },
            h('div', { className: 'dr-paraPage' }, `第 ${String(page)} 页`),
            blocks.filter((block) => block.page === page).map(row)
          ))
        );
      }
      return h('div', { className: 'dr-paras plain' }, blocks.map(row));
    }

    /** The scales the menu offers. */
    const PRESET_ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];


    function ReviewBody(props) {
      const [mode, setMode] = useState('preview');
      const [doc, setDoc] = useState(null);
      const [status, setStatus] = useState('');
      const [tone, setTone] = useState('idle');
      const [busy, setBusy] = useState(false);
      const [notes, setNotes] = useState([]);
      const [draft, setDraft] = useState(null);
      const [panel, setPanel] = useState('notes');
      const [kind, setKind] = useState('must-fix');
      const [query, setQuery] = useState('');
      const [focus, setFocus] = useState('');
      const [stamp, setStamp] = useState(null);
      const [paraBlocks, setParaBlocks] = useState([]);
      // 比例菜单是否展开。
      const [zoomMenu, setZoomMenu] = useState(false);

      /** Close the factor menu when the human clicks away from it. */
      useEffect(() => {
        if (!zoomMenu) return undefined;
        const onDown = (event) => {
          const target = event.target;
          if (target !== null && target.closest !== undefined && target.closest('.dr-zoomMenuWrap') !== null) return;
          setZoomMenu(false);
        };
        document.addEventListener('pointerdown', onDown, true);
        return () => document.removeEventListener('pointerdown', onDown, true);
      }, [zoomMenu]);
      // 页面上被选中的文字块（单击选中，弹出改字窗）。
      const [selected, setSelected] = useState(null);
      // 改字窗里正在编辑的草稿文字。
      const [selectedText, setSelectedText] = useState('');
      // 正在“原地改字”的那一块（双击进入）。为 null 时所有块都只做选中。
      const [inlineEdit, setInlineEdit] = useState(null);
      // Zoom lives in one controller: buttons, keys, wheel and pinch share it.
      const scrollRef = useRef(null);
      // The wheel needs the container to exist before it can listen on it.
      // A counter bumped when the node actually changes re-runs that effect.
      const [scrollTick, setScrollTick] = useState(0);
      const attachScroll = useCallback((node) => {
        const had = scrollRef.current !== null;
        scrollRef.current = node;
        if (node !== null && !had) setScrollTick((value) => value + 1);
      }, []);
      const zoomCtl = useZoom(scrollRef, scrollTick);
      const {
        zoom, fit, toast,
        setZoom, zoomTo, zoomStep, zoomReset, zoomFit, setPageSize,
      } = zoomCtl;
      // The plain-text draft, while the human is typing in it.
      const [pendingText, setPendingText] = useState('');
      // Which view of the document is shown: the picture, or its text.
      const [view, setView] = useState('page');
      // The pages near the viewport, as a set the blobs are fetched for. A
      // counter is bumped whenever the set grows, so the fetch runs again.
      const pageWanted = useRef({});
      const [wantedVersion, setWantedVersion] = useState(0);
      // A Word document is edited as plain text in one face; a slide deck
      // keeps its own structure, so its paragraphs are shown as they are.
      const textStyle = doc !== null && (doc.ext === 'pptx' || doc.ext === 'ppt') ? 'slides' : 'plain';
      const [paraPages, setParaPages] = useState([]);
      const [blobs, setBlobs] = useState({});
      // Every blob URL made for the document that is open, so the whole set
      // can be released when another document replaces it.
      const blobUrls = useRef({});
      const [pending, setPending] = useState({});
      const pageRefs = useRef({});
      const paragraphRefs = useRef({});
      const htmlFrame = useRef(null);

      const say = (text, tone2) => { setStatus(text); setTone(tone2 ?? 'idle'); };

      // The tab the owner is showing. The official previewer injects a
      // `tabInfo` reader into this seat, so the file comes from there.
      // The reader is a hook, so it is called unconditionally at the top
      // level; calling it inside a memo would break the hook order.
      // The tab the owner is showing.
      //
      // The official previewer offers a hook that reads it, but a hook may
      // only be called when it exists, and the panel must render the same way
      // every time. The tab is therefore read from the plain props, and the
      // resource address — which the seat always carries — names the file.
      const tab = props?.tab;

      // The file under review, recovered from the tab's resource address.
      //
      // A session-scoped address carries a workspace-relative path, so the
      // session travels with it and the Host resolves it against that
      // session's working directory. An absolute address needs no session.
      // The file is named by the resource address the seat carries. The
      // plain props are used, never a hook: a hook that is called only
      // sometimes changes the hook count between two renders, and React
      // refuses to render a component whose hooks do not match.
      const address = props?.resourceAddress ?? props?.tab?.contentId ?? '';
      const target = useMemo(() => {
        const params = tab?.navigation?.params;
        const fromParams = typeof params?.path === 'string' ? params.path : undefined;
        if (fromParams !== undefined && fromParams !== '') {
          return { path: fromParams, sessionId: '' };
        }
        const path = absolutePathOf(address);
        if (path === '') return { path: '', sessionId: '' };
        const sessionId = sessionOf(address);
        return { path, sessionId: sessionId === '' ? (props?.sessionId ?? '') : sessionId };
      }, [tab, address, props?.sessionId]);

      const file = target.path;
      const sessionId = target.sessionId;

      /**
       * The official owner bumps `content.revision` when the human presses
       * reload or the file changes on disk. The document is rendered from the
       * file itself, so a new revision is simply a re-render.
       */
      const revision = props?.content?.kind === 'renderer' ? props.content.revision : 0;
      // A counter the refresh button turns, so the document is loaded again.
      const [manualReload, setManualReload] = useState(0);
      const reloadToken = `${String(revision)}:${String(manualReload)}`;

      // Every blob of the previous document is released when a new one is
      // opened, and when the panel goes away.
      useEffect(() => {
        const held = blobUrls.current;
        return () => {
          for (const url of Object.values(held)) URL.revokeObjectURL(url);
          blobUrls.current = {};
          setBlobs({});
          pageWanted.current = {};
        };
      }, [file]);

      /**
       * Note which pages are near the viewport.
       *
       * A page's picture is drawn on the Host the first time it is asked for,
       * so asking for every page at once both wastes the work and, because
       * the renderer serves one request at a time, makes them all slow. The
       * first pages are asked for straight away so the panel is never empty;
       * the observer adds the ones the human scrolls towards.
       */
      useEffect(() => {
        if (doc === null) return undefined;
        // Whatever the document is — pages, a report, an image — the first
        // thing it shows is asked for at once, so the panel is never empty.
        let grew = false;
        for (const page of doc.pages.slice(0, 2)) {
          if (pageWanted.current[page.index] !== true) {
            pageWanted.current[page.index] = true;
            grew = true;
          }
        }
        if (grew) setWantedVersion((value) => value + 1);
        // Only a paged document scrolls through more pages to watch for.
        if (doc.kind !== 'pages') return undefined;

        if (typeof IntersectionObserver !== 'function') {
          // Without an observer every page is asked for, which is what the
          // panel did before; a slow panel beats a blank one.
          for (const page of doc.pages) pageWanted.current[page.index] = true;
          setWantedVersion((value) => value + 1);
          return undefined;
        }
        const observer = new IntersectionObserver((entries) => {
          let reached = false;
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const index = Number(entry.target.getAttribute('data-dr-page'));
            if (Number.isFinite(index) && pageWanted.current[index] !== true) {
              pageWanted.current[index] = true;
              reached = true;
            }
          }
          if (reached) setWantedVersion((value) => value + 1);
        }, { rootMargin: '1200px 0px' });
        for (const node of Object.values(pageRefs.current)) {
          if (node !== null && node !== undefined) observer.observe(node);
        }
        return () => observer.disconnect();
      }, [doc]);

      /**
       * The page images.
       *
       * They are fetched and turned into blob URLs: a plain image request
       * carries no Origin and is refused by the Connection fence, which
       * leaves every page blank. The blob is same-origin, so it renders.
       */
      useEffect(() => {
        if (doc === null) return undefined;
        let cancelled = false;
        const urls = [];
        // Only the pages near the viewport are asked for. Each one costs a
        // render on the Host, so asking for all of them at once made a burst
        // of work for pictures nobody had scrolled to — and the Host, running
        // one renderer per request, could not keep up with it.
        const wanted = [];
        for (const [index] of Object.entries(pageWanted.current)) {
          const page = doc.pages.find((candidate) => candidate.index === Number(index));
          if (page !== undefined) wanted.push(page);
        }
        wanted.sort((a, b) => a.index - b.index);
        const queue = wanted;
        const run = async () => {
          while (queue.length > 0) {
            if (cancelled) return;
            const page = queue.shift();
            try {
              if (typeof page.url !== 'string' || page.url === '') {
                void report(`kind=page-url-missing&index=${String(page.index)}`);
                continue;
              }
              const response = await fetch(page.url, { cache: 'no-store' });
              if (!response.ok) {
                void report(`kind=page-missing&status=${String(response.status)}&url=${encodeURIComponent(String(page.url))}`);
                continue;
              }
              const url = URL.createObjectURL(await response.blob());
              if (cancelled) { URL.revokeObjectURL(url); return; }
              urls.push(url);
              blobUrls.current[page.index] = url;
              setBlobs((previous) => ({ ...previous, [page.index]: url }));
            } catch { /* leave this page blank */ }
          }
        };
        void Promise.all([run(), run()]);
        return () => {
          cancelled = true;
          // The blobs outlive this run: the effect runs again whenever more
          // pages are wanted, and releasing the earlier ones would blank the
          // pages that were already showing.
        };
      }, [doc, wantedVersion]);

      /**
       * Watch the file.
       *
       * While the human is reviewing, the file may change — the agent may
       * rewrite it. The panel notices and says so instead of quietly showing
       * pages that no longer match the file on disk.
       */
      useEffect(() => {
        if (file === '' || doc === null) return undefined;
        const timer = window.setInterval(async () => {
          try {
            const payload = await call(`${API.render}&path=${encodeURIComponent(file)}&sessionId=${encodeURIComponent(sessionId)}`);
            if (payload?.stamp !== undefined && stamp !== null && payload.stamp !== stamp) {
              setStamp(payload.stamp);
              setDoc(payload);
              say('文件已被改动，已刷新预览', 'ok');
            }
          } catch { /* the poll is advisory */ }
        }, 15000);
        return () => window.clearInterval(timer);
      }, [file, sessionId, doc, stamp]);

      /**
       * Ask the Host what it can do, once the document is known.
       *
       * The answer comes back through the same report channel as the failures,
       * so a broken route is visible without a debugger.
       */
      useEffect(() => {
        if (file === '') return undefined;
        let cancelled = false;
        (async () => {
          try {
            const bench = await call(`${API.bench}&path=${encodeURIComponent(file)}&sessionId=${encodeURIComponent(sessionId)}`);
            void report(`kind=bench&result=${encodeURIComponent(JSON.stringify(bench))}`);
            const check = await call(`${API.selfcheck}&path=${encodeURIComponent(file)}&sessionId=${encodeURIComponent(sessionId)}`);
            const results = check.results ?? {};
            void report(`kind=selfcheck&result=${encodeURIComponent(JSON.stringify(results))}`);
            // The Host's own answer, shown where the human can see it.
            const parts = [];
            for (const [name, value] of Object.entries(results)) {
              if (name === 'routes') continue;
              parts.push(`${name}: ${String(value)}`);
            }
            if (parts.length > 0) say(`自检 · ${parts.join(' · ')}`, 'ok');
          } catch (error) {
            void report(`kind=selfcheck-failed&message=${encodeURIComponent(error instanceof Error ? error.message : String(error))}`);
          }
        })();
        return () => { cancelled = true; };
      }, [file, sessionId]);

      useEffect(() => {
        if (file === '') return;
        let cancelled = false;
        (async () => {
          setBusy(true); say('正在渲染…', 'busy');
          // The words are read first, in their own request: they cost a
          // fraction of a second and make the text view usable at once, while
          // the page image is still being drawn. The two reads run one after
          // another on purpose — both start a converter, and asking for two
          // at once made the slower one fail.
          let paragraphsPromise = Promise.resolve();
          try {
            const words = await call(`${API.textOnly}&path=${encodeURIComponent(file)}&sessionId=${encodeURIComponent(sessionId)}`).catch(() => null);
            if (words !== null && !cancelled && Array.isArray(words.blocks) && words.blocks.length > 0) {
              setParaBlocks(words.blocks);
            }
            const payload = await call(`${API.render}&path=${encodeURIComponent(file)}&sessionId=${encodeURIComponent(sessionId)}`);
            // The result is taken even when the effect has been run again:
            // the document that was asked for is the one on screen. Only a
            // different file makes the answer irrelevant.
            if (file !== '') {
              setDoc(payload);
            }
            setStamp(payload.stamp ?? null);
            setPendingText(typeof payload.text === 'string' ? payload.text : '');
            // Where each paragraph sits on the page is filled in afterwards.
            const placed = call(`${API.textBlocks}&path=${encodeURIComponent(file)}&sessionId=${encodeURIComponent(sessionId)}`)
              .then((paragraphs) => {
                if (cancelled) return;
                if (Array.isArray(paragraphs.blocks) && paragraphs.blocks.length > 0) {
                  setParaBlocks(paragraphs.blocks);
                }
                setParaPages(Array.isArray(paragraphs.pages) ? paragraphs.pages : []);
              })
              .catch((error) => {
                // The picture still shows; only the outlining is missing.
                void report(`kind=place-failed&message=${encodeURIComponent(error instanceof Error ? error.message : String(error))}`);
              });
            paragraphsPromise = placed;
            // An HTML report is edited through its own text runs.
            if (payload.kind === 'html') {
              try {
                const htmlText = await call(`${API.htmlText}&path=${encodeURIComponent(file)}&sessionId=${encodeURIComponent(sessionId)}`);
                if (!cancelled) setHtmlNodes(Array.isArray(htmlText.nodes) ? htmlText.nodes : []);
              } catch { /* the report stays read-only */ }
            }
            const missing = Array.isArray(payload.missingFonts) && payload.missingFonts.length > 0
              ? ` · 缺字体 ${payload.missingFonts.slice(0, 3).join('、')}`
              : '';
            const what = payload.kind === 'pages'
              ? `${String(payload.pageCount)} 页`
              : payload.kind === 'html'
                ? '网页'
                : payload.kind === 'text' ? '纯文本' : '图片';
            say(`${payload.name} · ${what}${missing}`, 'ok');
          } catch (error) {
            if (cancelled) return;
            say(error instanceof Error ? error.message : String(error), 'err');
          } finally {
            if (!cancelled) setBusy(false);
          }
        })();
        return () => { cancelled = true; };
      }, [file, sessionId, reloadToken]);

      /**
       * The document's paragraphs, with where they sit on the page.
       *
       * One box per paragraph, so the human edits a paragraph where they see
       * it — the way Office does — instead of picking a fragment of it.
       */
      const loadParagraphs = useCallback(async () => {
        setBusy(true); say('正在读取原文…', 'busy');
        try {
          const payload = await call(`${API.textBlocks}&path=${encodeURIComponent(file)}&sessionId=${encodeURIComponent(sessionId)}`);
          setParaBlocks(Array.isArray(payload.blocks) ? payload.blocks : []);
          setParaPages(Array.isArray(payload.pages) ? payload.pages : []);
          say(`原文已载入 · ${String((payload.blocks ?? []).length)} 段`, 'ok');
        } catch (error) {
          say(error instanceof Error ? error.message : String(error), 'err');
        } finally { setBusy(false); }
      }, [file, sessionId]);

      /** Locate one annotation's rectangle onto the paragraphs it covers. */
      const locateOne = useCallback(async (note) => {
        try {
          const payload = await call(API.locate, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              path: file,
              sessionId,
              annotations: [{ id: note.id, page: note.page, rect: note.rect }],
              pages: (doc?.pages ?? []).map((page) => ({ index: page.index, width: page.width, height: page.height })),
            }),
          });
          const blocks = payload.located?.[0]?.blocks ?? [];
          setNotes((previous) => previous.map((candidate) => (
            candidate.id === note.id ? { ...candidate, locatedBlocks: blocks } : candidate
          )));
        } catch (error) {
          // Locating is a convenience, but a failure is worth saying out loud.
          void report(`kind=locate-failed&message=${encodeURIComponent(error instanceof Error ? error.message : String(error))}`);
        }
      }, [file, sessionId, doc]);

      /* ── Editing the text where it is shown ──────────────────────────────── */

      /** Write every pending text edit into the file, then re-render. */
      const commitText = useCallback(async () => {
        const edits = Object.values(pending);
        if (edits.length === 0) return;
        setBusy(true); say('正在写入文字修改…', 'busy');
        try {
          const result = await call(API.editText, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ path: file, sessionId, edits, version: stamp ?? undefined }),
          });
          setPending({});
          const refreshed = await call(`${API.render}&path=${encodeURIComponent(file)}&sessionId=${encodeURIComponent(sessionId)}`);
          setDoc(refreshed);
          setStamp(refreshed.stamp ?? null);
          // The paragraphs are read again, so the boxes match the new file.
          try {
            const paragraphs = await call(`${API.textBlocks}&path=${encodeURIComponent(file)}&sessionId=${encodeURIComponent(sessionId)}`);
            setParaBlocks(Array.isArray(paragraphs.blocks) ? paragraphs.blocks : []);
            setParaPages(Array.isArray(paragraphs.pages) ? paragraphs.pages : []);
          } catch { /* the paragraphs are an addition */ }
          say(`已写入 ${String(result.applied)} 处修改，备份 ${String(result.backup).split(/[\/]/).pop()}`, 'ok');
        } catch (error) {
          // A conflict is not a failure to report but a choice to offer: the
          // file moved on while the human was editing it.
          const message = error instanceof Error ? error.message : String(error);
          if (message.includes('已被改动')) {
            say(`${message}（可在审阅台点「刷新」重新载入）`, 'err');
          } else {
            say(message, 'err');
          }
        } finally { setBusy(false); }
      }, [pending, file, sessionId]);

      /* ── The annotation surface ──────────────────────────────────────────── */

      const pageOf = (clientX, clientY) => {
        for (const [index, node] of Object.entries(pageRefs.current)) {
          if (node === null || node === undefined) continue;
          const rect = node.getBoundingClientRect();
          if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
            const page = doc?.pages.find((candidate) => candidate.index === Number(index));
            if (page !== undefined) return { rect, index: Number(index), page };
          }
        }
        return null;
      };

      const onLayerDown = (event) => {
        if (mode !== 'review' || doc === null || doc.kind !== 'pages') return;
        if (event.button !== 0) return;
        const hit = pageOf(event.clientX, event.clientY);
        if (hit === null) return;
        event.preventDefault();
        const clamp = (v) => Math.min(1, Math.max(0, v));
        const sx = clamp((event.clientX - hit.rect.left) / hit.rect.width);
        const sy = clamp((event.clientY - hit.rect.top) / hit.rect.height);
        setDraft({ page: hit.index, x0: sx, y0: sy, x1: sx, y1: sy });

        const onMove = (moveEvent) => {
          setDraft({
            page: hit.index, x0: sx, y0: sy,
            x1: clamp((moveEvent.clientX - hit.rect.left) / hit.rect.width),
            y1: clamp((moveEvent.clientY - hit.rect.top) / hit.rect.height),
          });
        };
        const onUp = (upEvent) => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          const x = clamp((upEvent.clientX - hit.rect.left) / hit.rect.width);
          const y = clamp((upEvent.clientY - hit.rect.top) / hit.rect.height);
          setDraft(null);
          const rect = { x: Math.min(sx, x), y: Math.min(sy, y), w: Math.abs(x - sx), h: Math.abs(y - sy) };
          if (rect.w < 0.012 || rect.h < 0.008) return;
          const note = makeNote(hit.page, rect, kind);
          setNotes((previous) => previous.concat([note]));
          setPanel('notes');
          // Locate the new note straight away, so it already points at the
          // paragraph the human boxed.
          void locateOne(note);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      };

      /* ── Editing an HTML report in place ─────────────────────────────────── */

      /**
       * The text runs of an HTML report, and what the human changed in them.
       *
       * The report is shown in a frame; the frame is handed a small script
       * that makes its text editable and reports every change back, so the
       * words change where the human sees them.
       */
      const [htmlNodes, setHtmlNodes] = useState([]);
      const [htmlEdits, setHtmlEdits] = useState({});

      const loadHtmlNodes = useCallback(async () => {
        if (doc === null || doc.kind !== 'html') return;
        try {
          const payload = await call(`${API.htmlText}&path=${encodeURIComponent(file)}&sessionId=${encodeURIComponent(sessionId)}`);
          setHtmlNodes(Array.isArray(payload.nodes) ? payload.nodes : []);
        } catch (error) {
          say(error instanceof Error ? error.message : String(error), 'err');
        }
      }, [doc, file, sessionId]);

      /**
       * The script handed to the report's frame.
       *
       * It marks the text runs so the panel can follow them, lets the human
       * edit them, and reports every change with the run's id.
       */
      /**
       * The script handed to the report's frame.
       *
       * It marks the text runs so the panel can follow them, lets the human
       * edit them, and reports every change back with the run's id.
       */
      const htmlBridgeScript = (nodes) => `
          (function () {
            var runs = ${JSON.stringify(nodes)};
            var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
              acceptNode: function (node) {
                return node.nodeValue.trim() === '' ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
              }
            });
            var index = 0;
            var pending = {};
            // The browser's text nodes have their whitespace folded, so the
            // runs are matched by their text, not by their position.
            var byText = {};
            for (var r = 0; r < runs.length; r++) {
              var key = runs[r].text.replace(/\s+/g, '');
              if (key !== '') (byText[key] = byText[key] || []).push(runs[r]);
            }
            var used = {};
            while (walker.nextNode()) {
              // A block-scoped binding keeps each text node in its own scope:
              // with var every listener would close over the same, last, node.
              let node = walker.currentNode;
              var key = node.nodeValue.replace(/\s+/g, '');
              var candidates = byText[key];
              if (candidates === undefined) continue;
              var run = null;
              for (var c = 0; c < candidates.length; c++) {
                if (used[candidates[c].offset] === true) continue;
                run = candidates[c];
                used[run.offset] = true;
                break;
              }
              if (run === null) continue;
              // A text node has no dataset of its own, so the marks live on
              // the element that holds it.
              let host = node.parentElement;
              if (host === null) continue;
              host.setAttribute('data-dr-run', run.id);
              host.setAttribute('data-dr-offset', String(run.offset));
              host.setAttribute('data-dr-original', node.nodeValue);
              host.style.cursor = 'text';
              host.style.outline = '1px dashed rgba(36,123,191,.45)';
              host.addEventListener('focus', function () {
                host.style.outline = '2px solid rgba(36,123,191,.9)';
                host.style.background = 'rgba(36,123,191,.10)';
              });
              host.addEventListener('blur', function () {
                host.style.outline = '1px dashed rgba(36,123,191,.45)';
                host.style.background = '';
                var id = host.getAttribute('data-dr-run');
                var original = host.getAttribute('data-dr-original');
                if (node.nodeValue !== original) {
                  pending[id] = {
                    id: id,
                    offset: Number(host.getAttribute('data-dr-offset')),
                    text: original,
                    newText: node.nodeValue,
                  };
                } else {
                  delete pending[id];
                }
                parent.postMessage({ source: 'doc-review', kind: 'html-edit', edits: pending }, '*');
              });
              host.addEventListener('keydown', function (event) {
                if (event.key === 'Escape') { node.nodeValue = host.getAttribute('data-dr-original'); host.blur(); }
              });
            }
            parent.postMessage({ source: 'doc-review', kind: 'html-ready' }, '*');
          })();
      `;

      /** Collect the changes the report's frame reported. */
      useEffect(() => {
        const onMessage = (event) => {
          const data = event.data;
          if (data === null || typeof data !== 'object') return;
          if (data.source !== 'doc-review') return;
          if (data.kind === 'html-ready') {
            setHtmlEdits({});
            say('HTML 报告已就绪：点文字即可直接改', 'ok');
          }
          if (data.kind === 'html-edit' && data.edits !== null && typeof data.edits === 'object') {
            setHtmlEdits(data.edits);
          }
        };
        window.addEventListener('message', onMessage);
        return () => window.removeEventListener('message', onMessage);
      }, []);

      /**
       * Put the bridge into the report's frame.
       *
       * The frame is same-origin, so its document can be reached directly; the
       * bridge marks the text runs and reports the changes back.
       */
      const injectHtmlBridge = useCallback(() => {
        const frame = htmlFrame.current;
        if (frame === null || frame === undefined) return;
        if (htmlNodes.length === 0) return;
        let body;
        try {
          body = frame.contentDocument?.body;
        } catch { return; }
        if (body === null || body === undefined) return;
        // A run that is already marked is left alone, so the bridge is not
        // applied twice to the same text.
        try {
          if (frame.contentDocument.querySelector('[data-dr-run]') !== null) return;
        } catch { return; }
        try {
          // The script is run in the frame's own window rather than appended
          // to its body: a script element in the report would become part of
          // the report, and would then be written into the file.
          frame.contentWindow.eval(htmlBridgeScript(htmlNodes));
        } catch (error) {
          say(`无法在报告里编辑：${error instanceof Error ? error.message : String(error)}`, 'err');
        }
      }, [htmlNodes]);

      // The frame may load before the nodes arrive, and the nodes may arrive
      // before the frame exists; the bridge is offered both ways round.
      useEffect(() => {
        if (doc === null || doc.kind !== 'html') return undefined;
        if (htmlNodes.length === 0) return undefined;
        const timer = window.setInterval(() => {
          if (htmlFrame.current?.contentDocument?.querySelector('[data-dr-run]') != null) {
            window.clearInterval(timer);
            return;
          }
          injectHtmlBridge();
        }, 400);
        return () => window.clearInterval(timer);
      }, [doc, htmlNodes, injectHtmlBridge]);

      /**
       * Write the plain-text draft back into the file.
       *
       * The line endings the file already uses are kept, so a save does not
       * quietly rewrite every line of it.
       */
      const commitPlain = useCallback(async () => {
        if (doc === null || doc.kind !== 'text') return;
        setBusy(true); say('正在写入…', 'busy');
        try {
          const result = await call(API.textSave, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ path: file, sessionId, content: pendingText }),
          });
          const refreshed = await call(`${API.render}&path=${encodeURIComponent(file)}&sessionId=${encodeURIComponent(sessionId)}`);
          setDoc(refreshed);
          setStamp(refreshed.stamp ?? null);
          setPendingText(typeof refreshed.text === 'string' ? refreshed.text : '');
          say(`已保存，备份 ${String(result.backup).split(/[\/]/).pop()}`, 'ok');
        } catch (error) {
          say(error instanceof Error ? error.message : String(error), 'err');
        } finally { setBusy(false); }
      }, [doc, file, sessionId, pendingText]);

      /** Write the report's changed text back into the file. */
      const commitHtml = useCallback(async () => {
        const list = Object.values(htmlEdits);
        if (list.length === 0) return;
        setBusy(true); say('正在写入 HTML 修改…', 'busy');
        try {
          const result = await call(API.htmlApply, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ path: file, sessionId, edits: list, version: stamp ?? undefined }),
          });
          setHtmlEdits({});
          say(`已写入 ${String(result.applied)} 处 HTML 修改，备份 ${String(result.backup).split(/[\/]/).pop()}`, 'ok');
          const refreshed = await call(`${API.render}&path=${encodeURIComponent(file)}&sessionId=${encodeURIComponent(sessionId)}`);
          setDoc(refreshed);
        } catch (error) {
          say(error instanceof Error ? error.message : String(error), 'err');
        } finally { setBusy(false); }
      }, [htmlEdits, file, sessionId]);

      /* ── The review package ──────────────────────────────────────────────── */

      const buildPackage = useCallback(() => {
        const lines = [];
        const textEdits = Object.values(pending);
        const reportEdits = Object.values(htmlEdits);
        if (reportEdits.length > 0) {
          lines.push(`## 报告里已经改好的文字（${String(reportEdits.length)} 处）`);
          for (const edit of reportEdits) {
            lines.push(`- 「${edit.text}」改为「${edit.newText}」`);
          }
        }
        if (textEdits.length > 0) {
          lines.push(`## 已经改好的文字（${String(textEdits.length)} 处，全文请照此修改）`);
          for (const edit of textEdits) {
            lines.push(`- 第 ${String(edit.page)} 页：「${edit.text}」改为「${edit.newText}」`);
          }
        }
        if (notes.length > 0) {
          lines.push(`## 批注（${String(notes.length)} 条）`);
          notes.forEach((note, index) => {
            const located = note.locatedBlocks ?? [];
            const where = located.length > 0
              ? located.map((block) => `${block.id}「${String(block.text).slice(0, 40)}」`).join(' / ')
              : `第 ${String(note.page)} 页 ${String(Math.round(note.rect.x * 100))}%,${String(Math.round(note.rect.y * 100))}%`;
            lines.push(`${String(index + 1)}. [${note.kind}] ${where}`);
            if (note.note !== '') lines.push(`   ${note.note}`);
          });
        }
        if (lines.length === 0) return '';
        return [
          `请审阅这个文件：${file}`,
          '',
          ...lines,
          '',
          '请按上面的批注修改这个文件；改完后给出修改后的完整文件。',
        ].join('\n');
      }, [notes, pending, htmlEdits, file]);

      const send = useCallback(() => {
        const text = buildPackage();
        if (text === '') { say('没有待发送的批注或修改', 'err'); return; }
        const actions = props?.inputActions;
        try {
          if (typeof actions?.insert === 'function') actions.insert(text);
          else if (typeof actions?.setText === 'function') actions.setText(text);
          else if (typeof actions?.setDraft === 'function') actions.setDraft(text);
          else { say('无法写入输入框，请手动复制', 'err'); return; }
          say('审阅包已放入输入框，可直接发送', 'ok');
        } catch (error) {
          say(error instanceof Error ? error.message : String(error), 'err');
        }
      }, [buildPackage, props?.inputActions]);



      /** The paragraph ids the notes point at. */
      const pointedIds = useMemo(() => {
        const set = new Set();
        for (const note of notes) {
          for (const entry of note.locatedBlocks ?? []) set.add(entry.id);
        }
        return set;
      }, [notes]);

      const indexOf = (id) => notes.findIndex((note) => note.id === id) + 1;
      const pendingCount = Object.keys(pending).length;

      /** The document's headings, as a navigable outline. */
      const outline = useMemo(
        () => paraBlocks
          .filter((block) => typeof block.heading === 'number')
          .map((block) => ({ id: block.id, level: block.heading, text: block.text })),
        [paraBlocks],
      );

      /** The paragraphs a search matches. */
      const matches = useMemo(() => {
        const needle = query.trim().toLowerCase();
        if (needle === '') return [];
        const found = [];
        for (const block of paraBlocks) {
          const at = String(block.text).toLowerCase().indexOf(needle);
          if (at >= 0) found.push({ id: block.id, at, text: block.text });
        }
        return found;
      }, [paraBlocks, query]);

      /**
       * Scroll the picture to one paragraph and put the cursor in it.
       *
       * This is how a box on the page leads to the words it covers.
       */
      const focusBlock = useCallback((id) => {
        setFocus(id);
        window.setTimeout(() => {
          const node = paragraphRefs.current[id];
          if (node === undefined || node === null) return;
          node.scrollIntoView({ block: 'center', behavior: 'smooth' });
          node.focus();
          const range = document.createRange();
          range.selectNodeContents(node);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
        }, 80);
      }, []);

      /**
       * The text blocks of a slide, one per shape.
       *
       * A slide is edited the way PowerPoint edits it: the human picks a text
       * block and opens it, rather than typing on the slide. Each block is a
       * shape with its paragraphs, and its area is the area they cover.
       */
      const shapeBlocks = useMemo(() => {
        const groups = new Map();
        for (const block of paraBlocks) {
          const key = block.shape;
          if (typeof key !== 'string' || key === '') continue;
          let group = groups.get(key);
          if (group === undefined) {
            group = {
              shape: key,
              page: block.page,
              name: typeof block.shapeName === 'string' ? block.shapeName : '',
              paragraphs: [],
              x0: block.box.x, y0: block.box.y,
              x1: block.box.x + block.box.w, y1: block.box.y + block.box.h,
              size: block.size,
            };
            groups.set(key, group);
          }
          group.paragraphs.push(block);
          group.x0 = Math.min(group.x0, block.box.x);
          group.y0 = Math.min(group.y0, block.box.y);
          group.x1 = Math.max(group.x1, block.box.x + block.box.w);
          group.y1 = Math.max(group.y1, block.box.y + block.box.h);
          group.size = Math.max(group.size, block.size);
        }
        return [...groups.values()];
      }, [paraBlocks]);

      /** Whether this document is edited one slide block at a time. */
      const byShape = textStyle === 'slides' && shapeBlocks.length > 0;

      /** The paragraphs of each page, keyed by page number. */
      const layerPages = useMemo(() => {
        const map = new Map();
        for (const page of paraPages ?? []) {
          map.set(page.index, { index: page.index, width: page.width, height: page.height, blocks: [] });
        }
        for (const block of paraBlocks ?? []) {
          let entry = map.get(block.page);
          if (entry === undefined) {
            entry = { index: block.page, width: 0, height: 0, blocks: [] };
            map.set(block.page, entry);
          }
          entry.blocks.push(block);
        }
        // The page's own size comes from the render; the text blocks only
        // carry the paragraphs.
        for (const page of doc?.pages ?? []) {
          const entry = map.get(page.index);
          if (entry !== undefined) {
            if (entry.width === 0) entry.width = page.width;
            if (entry.height === 0) entry.height = page.height;
          }
        }
        return map;
      }, [paraPages, paraBlocks, doc]);

      const pages = useMemo(() => {
        if (doc === null || doc.kind !== 'pages') return [];
        return doc.pages.map((page) => {
          const boxes = notes.filter((note) => note.page === page.index);
          const paragraphPage = layerPages.get(page.index);
          if (draft !== null && draft.page === page.index) {
            boxes.push({
              id: '__draft__', draft: true, kind: 'question', note: '',
              rect: {
                x: Math.min(draft.x0, draft.x1), y: Math.min(draft.y0, draft.y1),
                w: Math.abs(draft.x1 - draft.x0), h: Math.abs(draft.y1 - draft.y0),
              },
            });
          }
          return h('div', {
            key: page.index,
            className: 'dr-page',
            'data-dr-page': String(page.index),
            ref: (node) => { pageRefs.current[page.index] = node; },
          },
            blobs[page.index] === undefined
              // The page is drawn when it comes near the viewport; until then
              // the frame keeps its shape so the scrollbar stays honest.
              ? h('div', {
                  className: 'dr-ph',
                  style: {
                    aspectRatio: page.width > 0 && page.height > 0
                      ? `${String(page.width)} / ${String(page.height)}`
                      : '1 / 1.414',
                  },
                })
              : h('img', {
                  src: blobs[page.index],
                  alt: '',
                  draggable: false,
                  onLoad: (event) => {
                    const node = event.currentTarget;
                    if (node.naturalWidth > 0 && node.naturalHeight > 0) {
                      // Every page of a document shares its proportions; the
                      // first one is enough to fit the whole strip.
                      if (page.index === doc.pages[0].index) {
                        setPageSize(node.naturalWidth, node.naturalHeight);
                      }
                    }
                  },
                }),
            // A slide is edited block by block: each shape is one region to
            // pick, and the words are changed in the window that opens.
            byShape && paragraphPage !== undefined
              ? h('div', { className: 'dr-textlayer' },
                  shapeBlocks
                    .filter((group) => group.page === page.index)
                    .map((group) => {
                      const isSelected = selected !== null && selected.shape === group.shape;
                      const changed = group.paragraphs.some((block) => pending[block.id] !== undefined);
                      return h('div', {
                        key: group.shape,
                        className: `dr-shape${isSelected ? ' selected' : ''}${changed ? ' changed' : ''}`,
                        title: `${group.name || '文字块'} · 单击打开改字窗`,
                        ref: (node) => { paragraphRefs.current[group.shape] = node; },
                        style: {
                          left: `${String((group.x0 / paragraphPage.width) * 100)}%`,
                          top: `${String(((paragraphPage.height - group.y1) / paragraphPage.height) * 100)}%`,
                          width: `${String(((group.x1 - group.x0) / paragraphPage.width) * 100)}%`,
                          minHeight: `${String(((group.y1 - group.y0) / paragraphPage.height) * 100)}%`,
                        },
                        onPointerDown: (event) => { event.stopPropagation(); },
                        onClick: (event) => {
                          event.stopPropagation();
                          setInlineEdit(null);
                          setSelected({
                            shape: group.shape,
                            name: group.name,
                            page: page.index,
                            paragraphs: group.paragraphs,
                            text: group.paragraphs.map((block) => (
                              pending[block.id] !== undefined ? pending[block.id].newText : block.text
                            )).join('\n'),
                            anchor: {
                              left: (group.x0 / paragraphPage.width) * 100,
                              top: ((paragraphPage.height - group.y1) / paragraphPage.height) * 100,
                              width: ((group.x1 - group.x0) / paragraphPage.width) * 100,
                              height: ((group.y1 - group.y0) / paragraphPage.height) * 100,
                            },
                            pageWidth: paragraphPage.width,
                            pageHeight: paragraphPage.height,
                          });
                          setSelectedText(group.paragraphs.map((block) => (
                            pending[block.id] !== undefined ? pending[block.id].newText : block.text
                          )).join('\n'));
                        },
                      },
                        h('span', { className: 'dr-shapeTag' }, group.name === '' ? '文字块' : group.name)
                      );
                    })
                )
              : null,
            // The text layer sits over the picture: every run is a hit area
            // the human can double-click to edit the text where they see it.
            // One editable region per paragraph, placed over the picture.
            byShape || paragraphPage === undefined
              ? null
              : h('div', { className: 'dr-textlayer' },
                  paragraphPage.blocks.map((block) => {
                    const changed = pending[block.id];
                    const shown = changed !== undefined ? changed.newText : block.text;
                    // PDF coordinates start at the bottom left; the picture
                    // starts at the top left.
                    const left = (block.box.x / paragraphPage.width) * 100;
                    const top = ((paragraphPage.height - block.box.y - block.box.h) / paragraphPage.height) * 100;
                    const width = (block.box.w / paragraphPage.width) * 100;
                    const height = (block.box.h / paragraphPage.height) * 100;
                    const isSelected = selected !== null && selected.id === block.id;
                    const editingHere = inlineEdit === block.id;
                    return h('div', {
                      key: block.id,
                      className: `dr-para${changed !== undefined ? ' changed' : ''}${focus === block.id ? ' focus' : ''}${pointedIds.has(block.id) ? ' pointed' : ''}${isSelected ? ' selected' : ''}`,
                      ref: (node) => { paragraphRefs.current[block.id] = node; },
                      title: changed !== undefined
                        ? `原：${block.text}（双击原地改，单击开改字窗）`
                        : '单击选中并打开改字窗 · 双击原地改',
                      // 只有进入“原地改字”时才真的可编辑，其余时候单击只是选中，
                      // 这样点一下不会误改到内容。
                      contentEditable: editingHere,
                      suppressContentEditableWarning: true,
                      spellCheck: false,
                      style: {
                        left: `${String(left)}%`,
                        top: `${String(top)}%`,
                        width: `${String(width)}%`,
                        minHeight: `${String(Math.max(1.2, height))}%`,
                        fontSize: `${String(Math.max(6, (block.size / paragraphPage.height) * 100))}%`,
                      },
                      onPointerDown: (event) => {
                        // 选中态的块不再把事件交给框选层
                        event.stopPropagation();
                      },
                      onClick: (event) => {
                        if (editingHere) return;
                        event.stopPropagation();
                        // 单击：选中这一块并打开改字窗
                        setInlineEdit(null);
                        setSelected({
                          ...block,
                          page: page.index,
                          anchor: {
                            left: left,
                            top: top,
                            width: width,
                            height: Math.max(1.2, height),
                          },
                          pageWidth: paragraphPage.width,
                          pageHeight: paragraphPage.height,
                        });
                        setSelectedText(changed !== undefined ? changed.newText : block.text);
                      },
                      onDoubleClick: (event) => {
                        event.stopPropagation();
                        // 双击：仍然允许原地改，改完自动回到选中态
                        setSelected(null);
                        setInlineEdit(block.id);
                        const node = event.currentTarget;
                        node.focus();
                        const range = document.createRange();
                        range.selectNodeContents(node);
                        const selection = window.getSelection();
                        selection.removeAllRanges();
                        selection.addRange(range);
                      },
                      onInput: (event) => {
                        const value = event.currentTarget.textContent ?? '';
                        setPending((previous) => {
                          const next = { ...previous };
                          if (value === block.text) delete next[block.id];
                          else {
                            next[block.id] = {
                              id: block.id,
                              blockId: block.blockId ?? block.id,
                              page: page.index,
                              text: block.text,
                              newText: value,
                              whole: true,
                            };
                          }
                          return next;
                        });
                      },
                      onBlur: (event) => {
                        // An empty edit is not a change; put the original back.
                        const value = event.currentTarget.textContent ?? '';
                        if (value.trim() === '') event.currentTarget.textContent = block.text;
                        // 原地改字结束，退回普通状态（块的消失会由 state 驱动）
                        setInlineEdit((current) => (current === block.id ? null : current));
                      },
                      onKeyDown: (event) => {
                        if (event.key === 'Escape') {
                          event.preventDefault();
                          event.currentTarget.textContent = block.text;
                          setPending((previous) => {
                            const next = { ...previous };
                            delete next[block.id];
                            return next;
                          });
                          event.currentTarget.blur();
                        }
                      },
                    }, shown);
                  })
                ),
            // 选中的块旁边浮出改字窗：字号可读、有原文对照、可整块替换
            selected !== null && selected.page === page.index
              ? h(EditPopover, {
                  block: selected,
                  value: selectedText,
                  width: paragraphPage === undefined ? 1 : paragraphPage.width,
                  anchor: selected.anchor,
                  onChange: (value) => { setSelectedText(value); },
                  onCommit: () => {
                    const block = selected;
                    const value = selectedText;
                    setPending((previous) => {
                      const next = { ...previous };
                      if (Array.isArray(block.paragraphs)) {
                        // A slide block: a line of the window is a paragraph
                        // of the shape, in the order they are read.
                        const lines = value.split('\n');
                        block.paragraphs.forEach((paragraph, index) => {
                          const line = lines[index];
                          if (line === undefined) return;
                          if (line === paragraph.text) delete next[paragraph.id];
                          else {
                            next[paragraph.id] = {
                              id: paragraph.id,
                              blockId: paragraph.blockId ?? paragraph.id,
                              page: paragraph.page,
                              text: paragraph.text,
                              newText: line,
                              whole: true,
                            };
                          }
                        });
                        // Lines the window gained are added to the last
                        // paragraph, so nothing the human typed is dropped.
                        if (lines.length > block.paragraphs.length) {
                          const last = block.paragraphs[block.paragraphs.length - 1];
                          if (last !== undefined) {
                            const merged = lines.slice(block.paragraphs.length - 1).join('\n');
                            if (merged !== last.text) {
                              next[last.id] = {
                                id: last.id,
                                blockId: last.blockId ?? last.id,
                                page: last.page,
                                text: last.text,
                                newText: merged,
                                whole: true,
                              };
                            }
                          }
                        }
                      } else if (value === block.text) {
                        delete next[block.id];
                      } else {
                        next[block.id] = {
                          id: block.id,
                          blockId: block.blockId ?? block.id,
                          page: block.page,
                          text: block.text,
                          newText: value,
                          whole: true,
                        };
                      }
                      return next;
                    });
                    setSelected(null);
                    setSelectedText('');
                  },
                  onCancel: () => {
                    setSelected(null);
                    setSelectedText('');
                  },
                })
              : null,
            h('span', { className: 'dr-num' }, `第 ${String(page.index)} / ${String(doc.pageCount)} 页`),
            boxes.map((box) => h('div', {
              key: box.id,
              className: box.draft ? 'dr-box draft' : `dr-box ${box.kind ?? 'question'}`,
              style: {
                left: `${String(box.rect.x * 100)}%`, top: `${String(box.rect.y * 100)}%`,
                width: `${String(box.rect.w * 100)}%`, height: `${String(box.rect.h * 100)}%`,
              },
            }, box.draft ? null : h('b', null, `#${String(indexOf(box.id))} ${box.note.slice(0, 20) || '批注'}`)))
          );
        });
        // `zoom` is deliberately absent: the scale lives in a CSS variable,
        // so the page tree is not rebuilt when the human scales it.
      }, [doc, notes, draft, layerPages, pending, blobs, pointedIds, selected, selectedText, inlineEdit, focus, byShape, shapeBlocks]);

      const canText = doc !== null && (doc.ext === 'docx' || doc.ext === 'pptx' || doc.ext === 'xlsx'
        || ['txt', 'md', 'csv', 'html', 'htm', 'svg', 'json'].includes(doc.ext));

      let canvas;
      if (doc === null) {
        canvas = h('div', { className: 'dr-empty' }, '正在准备文档…');
      } else if (doc.kind === 'pages' && view === 'text') {
        // The document's own paragraphs, one after another, each editable in
        // place — the same way a plain-text file is edited.
        canvas = h('div', { className: 'dr-scroll' },
          h('div', { className: 'dr-page plain' },
            paraBlocks.length === 0
              ? h('div', { className: 'dr-hint' }, '正在读取原文…')
              : h(Paragraphs, {
                blocks: paraBlocks,
                pending,
                style: textStyle,
                onChange: (id, value, block) => {
                  setPending((previous) => {
                    const next = { ...previous };
                    if (value === block.text) delete next[id];
                    else {
                      next[id] = {
                        id,
                        blockId: block.blockId ?? id,
                        page: block.page,
                        text: block.text,
                        newText: value,
                        whole: true,
                      };
                    }
                    return next;
                  });
                },
              })));
      } else if (doc.kind === 'pages') {
        canvas = h('div', {
          className: 'dr-scroll pages',
          // One variable drives every page's width.
          style: { '--dr-zoom': String(zoom) },
          ref: attachScroll,
        }, pages);
      } else if (doc.kind === 'text') {
        // A plain-text file is shown as its own text, and edited there.
        canvas = h('div', { className: 'dr-scroll' },
          h('div', { className: 'dr-page plain' },
            h('textarea', {
              className: 'dr-plain',
              value: pendingText,
              spellCheck: false,
              onChange: (event) => setPendingText(event.target.value),
              onBlur: () => {
                if (pendingText !== (doc.text ?? '')) {
                  setPending((previous) => ({
                    ...previous,
                    __text__: { id: '__text__', page: 1, text: doc.text ?? '', newText: pendingText, whole: true },
                  }));
                }
              },
            })));
      } else if (doc.kind === 'html') {
        const url = blobs[1];
        canvas = h('div', { className: 'dr-scroll' },
          h('div', { className: 'dr-page' },
            url === undefined
              ? h('div', { className: 'dr-ph' }, '载入中…')
              : h('iframe', {
                  src: url, title: doc.name, ref: htmlFrame,
                  onLoad: () => injectHtmlBridge(),
                })));
      } else {
        // An image is annotated on top of itself, the same way a page is.
        const url = blobs[1];
        canvas = h('div', { className: 'dr-scroll' },
          h('div', {
            className: 'dr-page plain',
            'data-dr-page': '1',
            ref: (node) => { pageRefs.current[1] = node; },
          },
            url === undefined
              ? h('div', { className: 'dr-ph' }, '载入中…')
              : h('img', { src: url, alt: doc.name, draggable: false }),
            notes.filter((note) => note.page === 1).map((note) => h('div', {
              key: note.id,
              className: `dr-box ${note.kind ?? 'question'}`,
              style: {
                left: `${String(note.rect.x * 100)}%`, top: `${String(note.rect.y * 100)}%`,
                width: `${String(note.rect.w * 100)}%`, height: `${String(note.rect.h * 100)}%`,
              },
            }, h('b', null, `#${String(indexOf(note.id))} ${note.note.slice(0, 18) || '批注'}`)))
          ));
      }

      /**
       * The pending text edits.
       *
       * A small mistake is fixed by editing the text where it is; this list
       * shows what is still unsaved and lets the human drop one of them.
       */
      const editsPanel = h('div', { className: 'dr-list' },
        outline.length > 0
          ? h('div', { className: 'dr-outline' },
              h('div', { className: 'dr-outlineTitle' }, '大纲'),
              outline.map((item) => h('button', {
                key: item.id,
                className: `dr-outlineItem${focus === item.id ? ' on' : ''}`,
                style: { paddingLeft: `${String(6 + (item.level - 1) * 12)}px` },
                title: item.text,
                onClick: () => focusBlock(item.id),
              }, item.text))
            )
          : null,
        Object.keys(pending).length === 0
          ? h('div', { className: 'dr-hint' }, '在预览上双击一段文字即可直接改；改过的段会变黄。')
          : Object.values(pending).map((edit) => h('div', { className: 'dr-note', key: edit.id },
              h('span', { className: 'dr-idx' }, '改'),
              h('div', { className: 'dr-noteBody' },
                h('div', { className: 'dr-noteMeta' }, `第 ${String(edit.page)} 页`),
                h('div', { className: 'dr-diff' },
                  h('span', { className: 'dr-diffOld' }, edit.text),
                  h('span', { className: 'dr-diffArrow' }, '→'),
                  h('span', { className: 'dr-diffNew' }, edit.newText)
                )
              ),
              h('button', {
                className: 'dr-del', title: '撤销这一处',
                onClick: () => setPending((previous) => {
                  const next = { ...previous };
                  delete next[edit.id];
                  return next;
                }),
              }, '×')
            ))
      );

      const notesPanel = h('div', { className: 'dr-list' },
        notes.length === 0
          ? h('div', { className: 'dr-hint' }, '在「审阅」模式下于页面上拖拽即可框选问题。')
          : notes.map((note) => h('div', { className: 'dr-note', key: note.id },
              h('span', { className: 'dr-idx' }, String(indexOf(note.id))),
              h('div', { className: 'dr-body' },
                h('div', { className: 'dr-meta' },
                  h('span', null, `第 ${String(note.page)} 页`),
                  KINDS.map((entry) => h('button', {
                    key: entry.id,
                    className: `dr-kind${note.kind === entry.id ? ` on ${entry.id}` : ''}`,
                    onClick: () => setNotes((previous) => previous.map((candidate) => (
                      candidate.id === note.id ? { ...candidate, kind: entry.id } : candidate
                    ))),
                  }, entry.label)),
                  note.locatedBlocks !== undefined && note.locatedBlocks.length > 0
                    ? h('button', {
                        className: 'dr-jump',
                        title: note.locatedBlocks[0].text,
                        onClick: () => focusBlock(note.locatedBlocks[0].id),
                      }, `→ ${note.locatedBlocks[0].id}`)
                    : null
                ),
                h('textarea', {
                  value: note.note,
                  placeholder: '要改什么？',
                  onChange: (event) => {
                    const value = event.target.value;
                    setNotes((previous) => previous.map((candidate) => (
                      candidate.id === note.id ? { ...candidate, note: value } : candidate
                    )));
                  },
                })
              ),
              h('button', {
                className: 'dr-del', title: '删除',
                onClick: () => setNotes((previous) => previous.filter((candidate) => candidate.id !== note.id)),
              }, '×')
            ))

      );

      return h('div', { className: 'dr-root' },
        h(Style),
        // The factor flashes over the page while the human scales it.
        h('div', { className: `dr-zoomToast${toast ? ' on' : ''}` },
          `${String(Math.round(zoom * 100))}%`),
        h('div', { className: 'dr-head' },
          h('button', {
            className: mode === 'preview' ? 'dr-btn primary' : 'dr-btn',
            onClick: () => setMode('preview'),
          }, '预览'),
          h('button', {
            className: mode === 'review' ? 'dr-btn primary' : 'dr-btn',
            onClick: () => setMode('review'),
            title: '进入审阅：可框选批注、直接改原文',
          }, h(ReviewIcon, { size: 14 }), '审阅'),
          h('button', {
            className: 'dr-btn',
            onClick: () => setManualReload((value) => value + 1),
            title: '重新载入文件（文件在磁盘上被改动后用）',
          }, '刷新'),
          doc !== null && doc.kind === 'pages'
            ? h('button', {
                className: 'dr-btn',
                onClick: () => setView((value) => (value === 'page' ? 'text' : 'page')),
                title: view === 'page' ? '按文字逐段修改' : '回到页面预览',
              }, view === 'page' ? '看文字' : '看页面')
            : null,
          doc !== null && doc.kind === 'pages'
            ? h('div', { className: 'dr-zoom' },
                h('button', {
                  className: 'dr-zoomBtn',
                  title: '缩小（Ctrl -）',
                  disabled: zoom <= ZOOM_MIN + 1e-6,
                  onClick: () => { zoomStep(-1); },
                }, '−'),
                h('div', { className: 'dr-zoomMenuWrap' },
                  h('button', {
                    className: `dr-zoomValue${fit === 'manual' ? '' : ' fit'}`,
                    title: fit === 'manual' ? '缩放比例' : `${fit === 'width' ? '适应宽度' : '适应页面'}中`,
                    onClick: () => { setZoomMenu((open) => !open); },
                  },
                    `${String(Math.round(zoom * 100))}%`,
                    h('span', { className: 'dr-zoomCaret' }, '▾')
                  ),
                  zoomMenu
                    ? h('div', { className: 'dr-zoomMenu' },
                        PRESET_ZOOMS.map((preset) => h('button', {
                          key: String(preset),
                          className: `dr-zoomItem${Math.abs(zoom - preset) < 1e-6 ? ' on' : ''}`,
                          onClick: () => { zoomTo(preset); setZoomMenu(false); },
                        }, `${String(Math.round(preset * 100))}%`)),
                        h('div', { className: 'dr-zoomSplit' }),
                        h('button', {
                          className: `dr-zoomItem${fit === 'width' ? ' on' : ''}`,
                          onClick: () => { zoomFit('width'); setZoomMenu(false); },
                        }, '适应宽度'),
                        h('button', {
                          className: `dr-zoomItem${fit === 'page' ? ' on' : ''}`,
                          onClick: () => { zoomFit('page'); setZoomMenu(false); },
                        }, '适应页面')
                      )
                    : null
                ),
                h('button', {
                  className: 'dr-zoomBtn',
                  title: '放大（Ctrl +）',
                  disabled: zoom >= ZOOM_MAX - 1e-6,
                  onClick: () => { zoomStep(1); },
                }, '+')
              )
            : null,
          mode === 'review'
          ? h('span', { className: 'dr-hint' },
              doc !== null && doc.kind === 'pages'
                ? (paraBlocks.length > 0
                    ? `双击文字即可改 · ${String(paraBlocks.length)} 段可改`
                    : '正在准备可编辑文字…')
                : '拖拽框选问题区域')
          : null
        ),
        status === '' ? null : h('div', { className: `dr-status${tone === 'err' ? ' err' : tone === 'busy' ? ' busy' : ''}` },
          h('span', { className: 'dr-dot' }), h('em', { title: status }, status)),
        h('div', { style: { flex: '1 1 auto', minHeight: 0, display: 'flex', position: 'relative' } },
          canvas,
          // The box-drawing surface belongs to the picture: in the text view
          // there is no page to draw on.
          mode === 'review' && doc !== null && doc.kind === 'pages' && view === 'page'
            ? h('div', {
                className: 'dr-layer',
                onPointerDown: (event) => {
                  // 点空白处先收起改字窗，再进入框选
                  setSelected(null);
                  setSelectedText('');
                  onLayerDown(event);
                },
              })
            : null,
        // 点改字窗以外的地方就收起它（点在窗内由窗自己 stopPropagation）
        selected !== null
          ? h('div', {
              className: 'dr-popShield',
              onPointerDown: () => { setSelected(null); setSelectedText(''); },
            })
          : null
        ),
        mode === 'review'
          ? h('div', { className: 'dr-panel' },
              h('div', { className: 'dr-panelHead' },
                h('button', {
                  className: panel === 'notes' ? 'dr-kind on' : 'dr-kind',
                  onClick: () => setPanel('notes'),
                }, `批注 ${String(notes.length)}`),
                h('button', {
                  className: panel === 'edits' ? 'dr-kind on' : 'dr-kind',
                  onClick: () => setPanel('edits'),
                }, `改字 ${pendingCount > 0 ? String(pendingCount) : ''}`.trim()),
                h('span', { className: 'dr-count' }, notes.length + pendingCount === 0 ? '' : `${String(notes.length + pendingCount)} 项待处理`)
              ),
              panel === 'notes' ? notesPanel : editsPanel
            )
          : null,
        mode === 'review'
          ? h('div', { className: 'dr-toolbar' },
              h('span', { className: 'dr-hint' }, ''),
              h('button', {
                className: 'dr-btn', onClick: send,
                disabled: busy || (notes.length === 0 && pendingCount === 0 && Object.keys(htmlEdits).length === 0),
                title: '把批注和改字整理成结构化审阅包放进输入框，由 AI 修改',
              }, '发给 AI'),
              doc !== null && doc.kind === 'text'
                ? h('button', {
                    className: 'dr-btn primary', onClick: commitPlain,
                    disabled: busy || pendingText === (doc?.text ?? ''),
                    title: '把改过的文字写回文件（会自动备份）',
                  }, `保存${pendingText !== (doc?.text ?? '') ? ' •' : ''}`)
                : doc !== null && doc.kind === 'html'
                ? h('button', {
                    className: 'dr-btn primary', onClick: commitHtml,
                    disabled: busy || Object.keys(htmlEdits).length === 0,
                    title: '把改过的文字写回 HTML（会自动备份）',
                  }, `保存${Object.keys(htmlEdits).length > 0 ? ` (${String(Object.keys(htmlEdits).length)})` : ''}`)
                : h('button', {
                    className: 'dr-btn primary', onClick: commitText,
                    disabled: busy || pendingCount === 0,
                    title: '把改过的文字写回文件（会自动备份）',
                  }, `保存${pendingCount > 0 ? ` (${String(pendingCount)})` : ''}`)
            )
          : null
      );
    }

    /**
     * The header control that switches the open tab into review mode.
     *
     * It hangs on the official `sidebar.right.tab.document.action` seat,
     * which is the stable place for renderer-specific controls in the preview
     * header.
     */
    function ReviewAction() {
      return h('button', {
        type: 'button',
        title: '在预览中进入审阅模式',
        'aria-label': '审阅',
        style: {
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: '26px', height: '26px', padding: 0, cursor: 'pointer',
          border: '1px solid transparent', borderRadius: '6px',
          background: 'transparent', color: 'var(--dsw-alias-label-secondary)',
        },
      }, h(ReviewIcon, { size: 15 }));
    }

    /**
     * An error boundary.
     *
     * A renderer that throws is blanked by the host, which leaves the human
     * with an empty panel and no clue. This shows the failure instead and
     * reports it to the Host, so a broken build is diagnosable.
     */
    class ReviewErrorCatcher extends React.Component {
      constructor(props) {
        super(props);
        this.state = { failed: false };
      }
      static getDerivedStateFromError(error) { return { failed: true, error }; }
      componentDidCatch(error) { this.props.onError?.(error); }
      render() {
        if (this.state.failed) return null;
        return this.props.children;
      }
    }

    /**
     * The error boundary around the review desk.
     *
     * It is a class component on purpose: only a class can catch a render
     * error. The failed tree is replaced by a plain message, and the desk is
     * rebuilt from scratch when the human asks for it, so the hook order of
     * the panel never changes between two renders.
     */
    class ReviewBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { error: null, attempt: 0 };
      }

      static getDerivedStateFromError(error) {
        return { error };
      }

      componentDidUpdate(previous) {
        // A new document is a new attempt: the panel starts clean.
        if (previous.document !== this.props.document && this.state.error !== null) {
          this.setState({ error: null });
        }
      }

      render() {
        const { error, attempt } = this.state;
        if (error !== null) {
          return h('div', { className: 'dr-empty' },
            h('div', null, '审阅台加载失败：'),
            h('div', { style: { color: 'var(--dsw-alias-state-error-primary)', marginTop: '6px' } },
              String(error?.message ?? error)),
            h('button', {
              className: 'dr-btn', style: { marginTop: '10px' },
              onClick: () => this.setState({ error: null, attempt: attempt + 1 }),
            }, '重试'));
        }
        return h(ReviewErrorCatcher, {
          onError: (error) => this.setState({ error }),
          children: h(ReviewBody, { ...this.props, attempt }),
        });
      }
    }

    return {
      // The preview registry is a client service the Harness provides.
      inject: ['slots', 'documentPreviews'],
      apply(ctx) {
        /**
         * The candidate renderer.
         *
         * `documentPreviews` is provided through the reflection service by the
         * official previewer, so it may appear after this plugin activates.
         * Declaring it as an injected dependency makes the harness wait for it,
         * and the direct lookup covers the case where it is already there.
         * Registering makes the official preview owner list the review desk
         * beside its built-in renderers, so the human can pick it per tab.
         */
        const registerWith = (previews) => {
          ctx.effect(() => previews.register({
            id: ID,
            // Markdown keeps the shipped renderer: it already reads Markdown
            // properly, and this desk draws a document, not a document with
            // markup in it.
            extensions: ['docx', 'doc', 'pptx', 'ppt', 'xlsx', 'xls', 'pdf', 'odt', 'odp', 'ods', 'rtf', 'txt', 'csv', 'html', 'htm'],
            priority: 'extension',
            title: () => '审阅台',
            loading: 'renderer',
            wrap: false,
          }), 'doc-review: preview registration');
          // The same desk for Markdown, offered next to the shipped reader
          // rather than in place of it.
          ctx.effect(() => previews.register({
            id: `${ID}/markdown`,
            extensions: ['md', 'markdown'],
            priority: 'builtin',
            title: () => '审阅台（Markdown）',
            loading: 'renderer',
            wrap: false,
          }), 'doc-review: markdown registration');
        };

        // The registry is provided through the reflection service, so it is
        // reached by declaring it as a dependency: the harness then hands it
        // over once it exists.
        // The registry is a service the Harness provides to the client: it
        // is named in the module's `inject` list, so it is handed over
        // directly on the context.
        const registry = ctx.documentPreviews;
        if (registry === undefined || typeof registry.register !== 'function') {
          ctx.logger?.warn?.('doc-review: documentPreviews is unavailable; no review renderer was registered');
        } else {
          registerWith(registry);
        }

        // Report the live registry to the Host, so a registration that did not
        // take is visible from the Host side instead of being silent.
        const reportRegistry = () => {
          let ids = [];
          try {
            const snapshot = registry?.getSnapshot?.();
            if (Array.isArray(snapshot)) ids = snapshot.map((definition) => definition.id);
          } catch { /* the registry may not be readable from here */ }
          void report(`kind=registry&ids=${encodeURIComponent(ids.join(','))}&registered=${String(ids.includes(ID))}`);
        };
        ctx.effect(() => {
          reportRegistry();
          const timer = window.setInterval(reportRegistry, 4000);
          return () => window.clearInterval(timer);
        }, 'doc-review: registry report');

        /**
         * The body, in the document seat the official previewer owns.
         *
         * The seat is declared as a child of the previewer's own tab type, so
         * the body is registered under that seat and the official owner
         * dispatches to it when the human picks the review desk.
         */
        ctx.effect(() => ctx.slots.inject('sidebar.right.tab.document', () => ctx.slots.register({
          name: 'sidebar.right.tab.document',
          key: ID,
          locale: NS,
        }, (props) => h(ReviewBoundary, props))), 'doc-review: body');

        // The same desk for a plain-text file, under its own key.
        ctx.effect(() => ctx.slots.inject('sidebar.right.tab.document', () => ctx.slots.register({
          name: 'sidebar.right.tab.document',
          key: `${ID}/markdown`,
          locale: NS,
        }, (props) => h(ReviewBoundary, props))), 'doc-review: markdown body');

        // The header control, in the seat reserved for renderer-specific
        // controls in the preview toolbar.
        ctx.effect(() => ctx.slots.inject('sidebar.right.tab.document.action', () => ctx.slots.register({
          name: 'sidebar.right.tab.document.action',
          key: ID,
          locale: NS,
        }, ReviewAction)), 'doc-review: action');
      },
    };
  },
});
