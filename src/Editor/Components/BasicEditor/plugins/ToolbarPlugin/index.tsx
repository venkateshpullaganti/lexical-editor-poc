/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */
import './index.css'

import {
   $createCodeNode,
   $isCodeNode,
   CODE_LANGUAGE_FRIENDLY_NAME_MAP,
   CODE_LANGUAGE_MAP,
   getLanguageFriendlyName
} from '@lexical/code'
import { $isLinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link'
import {
   $isListNode,
   INSERT_CHECK_LIST_COMMAND,
   INSERT_ORDERED_LIST_COMMAND,
   INSERT_UNORDERED_LIST_COMMAND,
   ListNode,
   REMOVE_LIST_COMMAND
} from '@lexical/list'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $isDecoratorBlockNode } from '@lexical/react/LexicalDecoratorBlockNode'
import {
   $createHeadingNode,
   $createQuoteNode,
   $isHeadingNode,
   HeadingTagType
} from '@lexical/rich-text'
import {
   $isAtNodeEnd,
   $isParentElementRTL,
   $selectAll,
   $wrapNodes as $wrapLeafNodesInElements
} from '@lexical/selection'
import {
   $findMatchingParent,
   $getNearestBlockElementAncestorOrThrow,
   $getNearestNodeOfType,
   mergeRegister
} from '@lexical/utils'
import {
   $createParagraphNode,
   $getNodeByKey,
   $getSelection,
   $isRangeSelection,
   $isRootNode,
   $isTextNode,
   CAN_REDO_COMMAND,
   CAN_UNDO_COMMAND,
   COMMAND_PRIORITY_CRITICAL,
   FORMAT_ELEMENT_COMMAND,
   FORMAT_TEXT_COMMAND,
   INDENT_CONTENT_COMMAND,
   LexicalEditor,
   NodeKey,
   OUTDENT_CONTENT_COMMAND,
   REDO_COMMAND,
   SELECTION_CHANGE_COMMAND,
   UNDO_COMMAND
} from 'lexical'
import * as React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import useModal from '../../hooks/useModal'
import DropDown, { DropDownItem } from '../../ui/DropDown'
import { sanitizeUrl } from '../../utils' // --> OFF
import { EmbedConfigs } from '../AutoEmbedPlugin'
import { INSERT_EMBED_COMMAND } from '@lexical/react/LexicalAutoEmbedPlugin'

/* eslint react/prop-types: 0 */

const IS_APPLE = false

const blockTypeToBlockName = {
   bullet: 'Bulleted List',
   check: 'Check List',
   code: 'Code Block',
   h1: 'Heading 1',
   h2: 'Heading 2',
   h3: 'Heading 3',
   h4: 'Heading 4',
   h5: 'Heading 5',
   h6: 'Heading 6',
   number: 'Numbered List',
   paragraph: 'Normal',
   quote: 'Quote'
}

const LowPriority = 1
// Below are utils. TODO: need to move to separate file
function dropDownActiveClass(active: boolean) {
   if (active) return 'active dropdown-item-active'
   return ''
}

export function getSelectedNode(selection: any): any {
   //FIXME: Error while importing the types
   const anchor = selection.anchor
   const focus = selection.focus
   const anchorNode = selection.anchor.getNode()
   const focusNode = selection.focus.getNode()
   if (anchorNode === focusNode) {
      return anchorNode
   }
   const isBackward = selection.isBackward()
   if (isBackward) {
      return $isAtNodeEnd(focus) ? anchorNode : focusNode
   }
   return $isAtNodeEnd(anchor) ? focusNode : anchorNode
}

function getCodeLanguageOptions(): [string, string][] {
   const options: [string, string][] = []

   for (const [lang, friendlyName] of Object.entries(
      CODE_LANGUAGE_FRIENDLY_NAME_MAP
   )) {
      options.push([lang, friendlyName])
   }

   return options
}

const CODE_LANGUAGE_OPTIONS = getCodeLanguageOptions()

function BlockFormatDropDown({
   editor,
   blockType
}: {
   blockType: keyof typeof blockTypeToBlockName
   editor: LexicalEditor
}): JSX.Element {
   const formatParagraph = () => {
      if (blockType !== 'paragraph') {
         editor.update(() => {
            const selection = $getSelection()

            if ($isRangeSelection(selection)) {
               $wrapLeafNodesInElements(selection, () => $createParagraphNode())
            }
         })
      }
   }

   const formatHeading = (headingSize: HeadingTagType) => {
      if (blockType !== headingSize) {
         editor.update(() => {
            const selection = $getSelection()

            if ($isRangeSelection(selection)) {
               $wrapLeafNodesInElements(selection, () =>
                  $createHeadingNode(headingSize)
               )
            }
         })
      }
   }

   const formatBulletList = () => {
      if (blockType !== 'bullet') {
         editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)
      } else {
         editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined)
      }
   }

   const formatCheckList = () => {
      if (blockType !== 'check') {
         editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined)
      } else {
         editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined)
      }
   }

   const formatNumberedList = () => {
      if (blockType !== 'number') {
         editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined)
      } else {
         editor.dispatchCommand(REMOVE_LIST_COMMAND, undefined)
      }
   }

   const formatQuote = () => {
      if (blockType !== 'quote') {
         editor.update(() => {
            const selection = $getSelection()

            if ($isRangeSelection(selection)) {
               $wrapLeafNodesInElements(selection, () => $createQuoteNode())
            }
         })
      }
   }

   const formatCode = () => {
      if (blockType !== 'code') {
         editor.update(() => {
            const selection = $getSelection()

            if ($isRangeSelection(selection)) {
               if (selection.isCollapsed()) {
                  $wrapLeafNodesInElements(selection, () => $createCodeNode())
               } else {
                  const textContent = selection.getTextContent()
                  const codeNode = $createCodeNode()
                  selection.insertNodes([codeNode])
                  selection.insertRawText(textContent)
               }
            }
         })
      }
   }

   return (
      <DropDown
         buttonClassName='toolbar-item block-controls'
         buttonIconClassName={`icon block-type ${blockType}`}
         buttonLabel={blockTypeToBlockName[blockType]}
         buttonAriaLabel='Formatting options for text style'
      >
         <DropDownItem
            className={`item ${dropDownActiveClass(blockType === 'paragraph')}`}
            onClick={formatParagraph}
         >
            <i className='icon paragraph' />
            <span className='text'>Normal</span>
         </DropDownItem>
         <DropDownItem
            className={`item ${dropDownActiveClass(blockType === 'h1')}`}
            onClick={() => formatHeading('h1')}
         >
            <i className='icon h1' />
            <span className='text'>Heading 1</span>
         </DropDownItem>
         <DropDownItem
            className={`item ${dropDownActiveClass(blockType === 'h2')}`}
            onClick={() => formatHeading('h2')}
         >
            <i className='icon h2' />
            <span className='text'>Heading 2</span>
         </DropDownItem>
         <DropDownItem
            className={`item ${dropDownActiveClass(blockType === 'h3')}`}
            onClick={() => formatHeading('h3')}
         >
            <i className='icon h3' />
            <span className='text'>Heading 3</span>
         </DropDownItem>
         <DropDownItem
            className={`item ${dropDownActiveClass(blockType === 'bullet')}`}
            onClick={formatBulletList}
         >
            <i className='icon bullet-list' />
            <span className='text'>Bullet List</span>
         </DropDownItem>
         <DropDownItem
            className={`item ${dropDownActiveClass(blockType === 'number')}`}
            onClick={formatNumberedList}
         >
            <i className='icon numbered-list' />
            <span className='text'>Numbered List</span>
         </DropDownItem>
         <DropDownItem
            className={`item ${dropDownActiveClass(blockType === 'quote')}`}
            onClick={formatQuote}
         >
            <i className='icon quote' />
            <span className='text'>Quote</span>
         </DropDownItem>
         <DropDownItem
            className={`item ${dropDownActiveClass(blockType === 'code')}`}
            onClick={formatCode}
         >
            <i className='icon code' />
            <span className='text'>Code Block</span>
         </DropDownItem>
      </DropDown>
   )
}

function Divider(): JSX.Element {
   return <div className='divider' />
}

export default function ToolbarPlugin(): JSX.Element {
   const [editor] = useLexicalComposerContext()
   const [activeEditor, setActiveEditor] = useState(editor)
   const [blockType, setBlockType] = useState<
      keyof typeof blockTypeToBlockName
   >('paragraph')
   const [selectedElementKey, setSelectedElementKey] = useState<NodeKey | null>(
      null
   )
   const [isLink, setIsLink] = useState(false)
   const [isBold, setIsBold] = useState(false)
   const [isItalic, setIsItalic] = useState(false)
   const [isUnderline, setIsUnderline] = useState(false)
   const [isStrikethrough, setIsStrikethrough] = useState(false)
   const [isSubscript, setIsSubscript] = useState(false)
   const [isSuperscript, setIsSuperscript] = useState(false)
   const [isCode, setIsCode] = useState(false)
   const [canUndo, setCanUndo] = useState(false)
   const [canRedo, setCanRedo] = useState(false)
   const [isRTL, setIsRTL] = useState(false)
   const [codeLanguage, setCodeLanguage] = useState<string>('')

   const updateToolbar = useCallback(() => {
      const selection = $getSelection()
      if ($isRangeSelection(selection)) {
         const anchorNode = selection.anchor.getNode()
         let element =
            anchorNode.getKey() === 'root'
               ? anchorNode
               : $findMatchingParent(anchorNode, e => {
                    const parent = e.getParent()
                    return parent !== null && $isRootNode(parent)
                 })

         if (element === null) {
            element = anchorNode.getTopLevelElementOrThrow()
         }

         const elementKey = element.getKey()
         const elementDOM = activeEditor.getElementByKey(elementKey)

         // Update text format
         setIsBold(selection.hasFormat('bold'))
         setIsItalic(selection.hasFormat('italic'))
         setIsUnderline(selection.hasFormat('underline'))
         setIsStrikethrough(selection.hasFormat('strikethrough'))
         setIsSubscript(selection.hasFormat('subscript'))
         setIsSuperscript(selection.hasFormat('superscript'))
         setIsCode(selection.hasFormat('code'))
         setIsRTL($isParentElementRTL(selection))

         // Update links
         const node = getSelectedNode(selection)
         const parent = node.getParent()
         if ($isLinkNode(parent) || $isLinkNode(node)) {
            setIsLink(true)
         } else {
            setIsLink(false)
         }

         if (elementDOM !== null) {
            setSelectedElementKey(elementKey)
            if ($isListNode(element)) {
               const parentList = $getNearestNodeOfType<ListNode>(
                  anchorNode,
                  ListNode
               )
               const type = parentList
                  ? parentList.getListType()
                  : element.getListType()
               setBlockType(type)
            } else {
               const type = $isHeadingNode(element)
                  ? element.getTag()
                  : element.getType()
               if (type in blockTypeToBlockName) {
                  setBlockType(type as keyof typeof blockTypeToBlockName)
               }
               if ($isCodeNode(element)) {
                  const language = element.getLanguage() as keyof typeof CODE_LANGUAGE_MAP
                  setCodeLanguage(
                     language ? CODE_LANGUAGE_MAP[language] || language : ''
                  )
                  return
               }
            }
         }
         // Handle buttons
      }
   }, [activeEditor])

   useEffect(
      () =>
         editor.registerCommand(
            SELECTION_CHANGE_COMMAND,
            (_payload, newEditor) => {
               updateToolbar()
               setActiveEditor(newEditor)
               return false
            },
            COMMAND_PRIORITY_CRITICAL
         ),
      [editor, updateToolbar]
   )

   useEffect(
      () =>
         mergeRegister(
            activeEditor.registerUpdateListener(({ editorState }) => {
               editorState.read(() => {
                  updateToolbar()
               })
            }),
            activeEditor.registerCommand<boolean>(
               CAN_UNDO_COMMAND,
               payload => {
                  setCanUndo(payload)
                  return false
               },
               COMMAND_PRIORITY_CRITICAL
            ),
            activeEditor.registerCommand<boolean>(
               CAN_REDO_COMMAND,
               payload => {
                  setCanRedo(payload)
                  return false
               },
               COMMAND_PRIORITY_CRITICAL
            )
         ),
      [activeEditor, updateToolbar]
   )

   const clearFormatting = useCallback(() => {
      activeEditor.update(() => {
         const selection = $getSelection()
         if ($isRangeSelection(selection)) {
            $selectAll(selection)
            selection.getNodes().forEach(node => {
               if ($isTextNode(node)) {
                  node.setFormat(0)
                  node.setStyle('')
                  $getNearestBlockElementAncestorOrThrow(node).setFormat('')
               }
               if ($isDecoratorBlockNode(node)) {
                  node.setFormat('')
               }
            })
         }
      })
   }, [activeEditor])

   const insertLink = useCallback(() => {
      if (!isLink) {
         editor.dispatchCommand(TOGGLE_LINK_COMMAND, sanitizeUrl('https://'))
      } else {
         editor.dispatchCommand(TOGGLE_LINK_COMMAND, null)
      }
   }, [editor, isLink])

   const onCodeLanguageSelect = useCallback(
      (value: string) => {
         activeEditor.update(() => {
            if (selectedElementKey !== null) {
               const node = $getNodeByKey(selectedElementKey)
               if ($isCodeNode(node)) {
                  node.setLanguage(value)
               }
            }
         })
      },
      [activeEditor, selectedElementKey]
   )

   return (
      <div className='toolbar'>
         <button
            disabled={!canUndo}
            onClick={() => {
               activeEditor.dispatchCommand(UNDO_COMMAND, undefined)
            }}
            title={IS_APPLE ? 'Undo (⌘Z)' : 'Undo (Ctrl+Z)'}
            className='toolbar-item spaced'
            aria-label='Undo'
         >
            <i className='format undo' />
         </button>
         <button
            disabled={!canRedo}
            onClick={() => {
               activeEditor.dispatchCommand(REDO_COMMAND, undefined)
            }}
            title={'Redo (Ctrl+Y)'}
            className='toolbar-item'
            aria-label='Redo'
         >
            <i className='format redo' />
         </button>
         <Divider />
         {blockType in blockTypeToBlockName && activeEditor === editor && (
            <>
               <BlockFormatDropDown blockType={blockType} editor={editor} />
               <Divider />
            </>
         )}
         {blockType === 'code' ? (
            <>
               <DropDown
                  buttonClassName='toolbar-item code-language'
                  buttonLabel={getLanguageFriendlyName(codeLanguage)}
                  buttonAriaLabel='Select language'
               >
                  {CODE_LANGUAGE_OPTIONS.map(([value, name]) => (
                     <DropDownItem
                        className={`item ${dropDownActiveClass(
                           value === codeLanguage
                        )}`}
                        onClick={() => onCodeLanguageSelect(value)}
                        key={value}
                     >
                        <span className='text'>{name}</span>
                     </DropDownItem>
                  ))}
               </DropDown>
            </>
         ) : (
            <>
               <button
                  onClick={() => {
                     activeEditor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')
                  }}
                  className={`toolbar-item spaced ${isBold ? 'active' : ''}`}
                  title={'Bold (Ctrl+B)'}
                  aria-label={`Format text as bold. Shortcut: ${
                     IS_APPLE ? '⌘B' : 'Ctrl+B'
                  }`}
               >
                  <i className='format bold' />
               </button>
               <button
                  onClick={() => {
                     activeEditor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')
                  }}
                  className={`toolbar-item spaced ${isItalic ? 'active' : ''}`}
                  title={IS_APPLE ? 'Italic (⌘I)' : 'Italic (Ctrl+I)'}
                  aria-label={`Format text as italics. Shortcut: ${
                     IS_APPLE ? '⌘I' : 'Ctrl+I'
                  }`}
               >
                  <i className='format italic' />
               </button>
               <button
                  onClick={() => {
                     activeEditor.dispatchCommand(
                        FORMAT_TEXT_COMMAND,
                        'underline'
                     )
                  }}
                  className={`toolbar-item spaced ${
                     isUnderline ? 'active' : ''
                  }`}
                  title={IS_APPLE ? 'Underline (⌘U)' : 'Underline (Ctrl+U)'}
                  aria-label={`Format text to underlined. Shortcut: ${
                     IS_APPLE ? '⌘U' : 'Ctrl+U'
                  }`}
               >
                  <i className='format underline' />
               </button>
               <button
                  onClick={() => {
                     activeEditor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code')
                  }}
                  className={`toolbar-item spaced ${isCode ? 'active' : ''}`}
                  title='Insert code block'
                  aria-label='Insert code block'
               >
                  <i className='format code' />
               </button>
               <button
                  onClick={insertLink}
                  className={`toolbar-item spaced ${isLink ? 'active' : ''}`}
                  aria-label='Insert link'
                  title='Insert link'
               >
                  <i className='format link' />
               </button>
               {/* {isLink &&
                  createPortal(
                     <FloatingLinkEditor editor={editor} />,
                     document.body
                  )} */}
               <Divider />
               <DropDown
                  buttonClassName='toolbar-item spaced'
                  buttonLabel=''
                  buttonAriaLabel='Formatting options for additional text styles'
                  buttonIconClassName='icon dropdown-more'
               >
                  <DropDownItem
                     onClick={() => {
                        activeEditor.dispatchCommand(
                           FORMAT_TEXT_COMMAND,
                           'strikethrough'
                        )
                     }}
                     className={`item ${dropDownActiveClass(isStrikethrough)}`}
                     title='Strikethrough'
                     aria-label='Format text with a strikethrough'
                  >
                     <i className='icon strikethrough' />
                     <span className='text'>Strikethrough</span>
                  </DropDownItem>
                  <DropDownItem
                     onClick={() => {
                        activeEditor.dispatchCommand(
                           FORMAT_TEXT_COMMAND,
                           'subscript'
                        )
                     }}
                     className={`item ${dropDownActiveClass(isSubscript)}`}
                     title='Subscript'
                     aria-label='Format text with a subscript'
                  >
                     <i className='icon subscript' />
                     <span className='text'>Subscript</span>
                  </DropDownItem>
                  <DropDownItem
                     onClick={() => {
                        activeEditor.dispatchCommand(
                           FORMAT_TEXT_COMMAND,
                           'superscript'
                        )
                     }}
                     className={`item ${dropDownActiveClass(isSuperscript)}`}
                     title='Superscript'
                     aria-label='Format text with a superscript'
                  >
                     <i className='icon superscript' />
                     <span className='text'>Superscript</span>
                  </DropDownItem>
               </DropDown>
            </>
         )}
         <Divider />
         <DropDown
            buttonLabel='Align'
            buttonIconClassName='icon left-align'
            buttonClassName='toolbar-item spaced alignment'
            buttonAriaLabel='Formatting options for text alignment'
         >
            <DropDownItem
               onClick={() => {
                  activeEditor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'left')
               }}
               className='item'
            >
               <i className='icon left-align' />
               <span className='text'>Left Align</span>
            </DropDownItem>
            <DropDownItem
               onClick={() => {
                  activeEditor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'center')
               }}
               className='item'
            >
               <i className='icon center-align' />
               <span className='text'>Center Align</span>
            </DropDownItem>
            <DropDownItem
               onClick={() => {
                  activeEditor.dispatchCommand(FORMAT_ELEMENT_COMMAND, 'right')
               }}
               className='item'
            >
               <i className='icon right-align' />
               <span className='text'>Right Align</span>
            </DropDownItem>
            <DropDownItem
               onClick={() => {
                  activeEditor.dispatchCommand(
                     FORMAT_ELEMENT_COMMAND,
                     'justify'
                  )
               }}
               className='item'
            >
               <i className='icon justify-align' />
               <span className='text'>Justify Align</span>
            </DropDownItem>
            <Divider />
         </DropDown>
         <DropDown
            buttonClassName='toolbar-item spaced'
            buttonLabel='Insert'
            buttonAriaLabel='Insert specialized editor node'
            buttonIconClassName='icon plus'
         >
            {EmbedConfigs.map(embedConfig => (
               <DropDownItem
                  key={embedConfig.type}
                  onClick={() => {
                     activeEditor.dispatchCommand(
                        INSERT_EMBED_COMMAND,
                        embedConfig.type
                     )
                  }}
                  className='item'
               >
                  {embedConfig.icon}
                  <span className='text'>{embedConfig.contentName}</span>
               </DropDownItem>
            ))}
         </DropDown>
      </div>
   )
}
