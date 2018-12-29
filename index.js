/* golbal location */
'use strict'

const IPFS = require('ipfs')

//node
const $nodeId = document.querySelector('.node-id')
const $nodeAddress = document.querySelector('.node-addresses')
const $logs = document.querySelector('#logs')

//peers
const $peers = document.querySelector('#peers')
const $peersList = document.querySelector('tbody')
const $multiaddrInput = document.querySelector('#multiaddr-input')
const $connectButton = document.querySelector('#peer-btn')

//files
const $multihashInput = document.querySelector('#multihash-input')
const $fetchButton = document.querySelector('#fetch-btn')
const $dragContainer = document.querySelector('#drag-container')
const $progressBar = document.querySelector('#progress-bar')
const $fileHistory = document.querySelector('#file-history tbody')
const $emptyRow = document.querySelector('.empty-row')

const $allDisabledBtns = document.querySelectorAll('button:disabled')
const $allDisabledInputs = document.querySelectorAll('input:disabled')
const $allDisabledElements = document.querySelectorAll('.disabled')

const FILES = []
const workspace = location.hash

let fileSize = 0
let node
let info
let Buffer

//start the ipfs node

function start() {
    if(!node) {
        const options = {
            EXPERIMENTAL: {
                pubsub: true
            },
            repo: 'ipfs-' + Math.random(),
            config: {
                Addresses: {
                    Swarm: ['/dns4/ws-star.discovery.libp2p.io/tcp/443/wss/p2p-websocket-star']
                }
            }
        }
        node = new IPFS(options)

        Buffer = node.types.Buffer

        //starting the node
        node.once('ready', () => {
            node.id().then((id) => {
                info = id
                updateView('ready', node)
                onSuccess('Node is ready.')
                setInterval(refreshPeerList, 1000)
                setInterval(sendFileList, 10000)
            })
            .catch((error) => onError(error))

        subscribeToWorkspace()
        })
    }    
}

//pubsub
const messageHandler = (message) => {
    const myNode = info.id
    const hash = message.data.toString()
    const messageSender = message.from

    if (myNode !== messageSender && !isFileInList(hash)) {
        $multihashInput.value = hash
        getFile()
    }
}
const subscribeToWorkspace = () => {
    node.pubsub.subscribe(workspace, messageHandler)
        .catch(() => onError('An error occured while subscribing'))
}

const publicHash = (hash) => {
    const data = Buffer.from(hash)
    node.pubsub.publish(workspace, data)
        .catch(() => onError('An error occured while publishing the message'))
}

//file handling

const isFileInList = (hash) => FILES.indexOf(hash) !== -1
const sendFileList = () => FILES.forEach((hash) => publicHash(hash))

const updateProgress = (bytesLoaded) => {
    let percentage = 100 - ((bytesLoaded/fileSize)*100)
    $progressBar.style.transform = `translateX(${-percentage}%)`
}
const resetProgress = () => {
    $progressBar.style.transform = `translateX(-100%)`
}
function appendFile (name, hash, size, data) {
    const file = new window.Blob([data], {type: 'application/octet-binary'})
    const url = window.URL.createObjectURL(file)
    const row = document.createElement('tr')

    const nameCell = document.createElement('td')
    nameCell.innerHTML = name

    const hashCell = document.createElement('td')
    hashCell.innerHTML = hash

    const sizeCell = document.createElement('td')
    sizeCell.innerHTML = size

    const downloadCell = document.createElement('td')
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute('download', name)
    link.innerHTML = '<img width=20 class="table-action" src="assets/download.svg" alt="Download">'
    downloadCell.appendChild(link)

    row.appendChild(nameCell)
    row.appendChild(hashCell)
    row.appendChild(sizeCell)
    row.appendChild(downloadCell)
    
    $fileHistory.insertBefore(row, $fileHistory.firstChild)

    publicHash(hash)
}

function getFile () {
    const hash = $multihashInput.value

    $multihashInput.value = ''
    if (!hash) {
        return onError('No hash was inserted')
    } else if (isFileInList(hash)) {
        return onSuccess('File is already present in the workspace')
    }
    FILES.push(hash)
    node.files.get(hash)
        .then((files) => {
            files.forEach((file) => {
                if (file.content) {
                    appendFile(file.name, hash, file.size, file.content)
                    onSuccess(`The ${file.name} file was added successfully`)
                    $emptyRow.style.display = 'none'
                }
            })
        })
        .catch(() => onError('there was an error'))
}

// drag and drop

const onDragEnter = () => $dragContainer.classList.add('dragging')
const onDragLeave = () => $dragContainer.classList.remove('dragging')

function onDrop (event) {
    onDragLeave()
    event.preventDefault()

    const dt = event.dataTransfer
    const filesDropped = dt.files

    function readFileContents (file) {
        return new Promise((resolve) => {
            const reader = new window.fileReader()
            reader.onLoad = (event) => resolve(event.target.result)
            reader.readAsArrayBuffer(file)
        })
    }

    const files = []
    for(let i = 0; i < filesDropped.length; i++) {
        files.push(filesDropped[i])
    }

    files.forEach((file) => {
        readFileContents(file)
            .then((buffer) => {
                fileSize = file.size

                node.files.add({
                    path: file.name,
                    content: Buffer.from(buffer)
                }, { wrap: true, progress: updateProgress }, (err, filesAdded) => {
                    if (err) {
                        return onError(err)
                    }

                    $multihashInput.value = filesAdded[1].hash

                    resetProgress()
                    getFile()
                })
            })
            .catch(onError)
    })
}

//peers handling

function connectToPeer (event) {
    const multiaddr = $multiaddrInput.value

    if (!multiaddr) {
        return onError('No MultiAddr was Inserted')
    }
    node.swarm.connect(multiaddr)
        .then(() => {
            onSuccess('Successfully connected to peer')
            $multiaddrInput.value = ''
        })
        .catch(() => onError('An error occured when connecting to peer'))
}
function refreshPeerList () {
    node.swarm.peers()
        .then((peers) => {
            const peersAsHtml = peers.reverse()
                .map((peer) => {
                    if (peer.addr) {
                        const addr = peer.addr.toString()
                        if (addr.indexOf('ipfs') >= 0) {
                            return addr
                        } else {
                            return addr + peer.peer.id.toB58String()
                        }
                    }
                })
                .map((addr) => {
                    return `<tr><td>${addr}</td></tr>`
                }).join('')

                $peersList.innerHTML = peersAsHtml
        })
        .catch((error) => onError(error))
}

//error handling

function onSuccess (msg) {
    $logs.classList.add('success')
    $logs.innerHTML = msg
}

function onError (err) {
    let msg = 'An error has occured'

    if (err.stack !== undefined) {
        msg = err.stack
    } else if (typeof err === 'string') {
        msg = err
    }

    $logs.classList.remove('success')
    $logs.innerHTML = msg
}

window.onerror = onError

//app states

const states = { 
    ready: () => {
        const addrHTML = info.addresses.map((addresses) => {
            return `<li><pre>${addresses}</pre></li>`
        }).join('')
        $nodeId.innerText = info.id
        $nodeAddress.innerHTML = addrHTML
        $allDisabledBtns.forEach(b => { b.disabled = false })
        $allDisabledInputs.forEach(b => { b.disabled = false })
        $allDisabledElements.forEach(el => { el.classList.remove('disabled') })
    }
}

function updateView (state, ipfs) {
    if(states[state] !== undefined) {
        states[state]()
    } else {
        throw new Error('Could not find state "' + state + '"')
    }
}

// booting the app

const startApplication = () => {
    $dragContainer.addEventListener('dragenter', onDragEnter)
    $dragContainer.addEventListener('dragover', onDragEnter)
    $dragContainer.addEventListener('drop', onDrop)
    $dragContainer.addEventListener('dragleave', onDragLeave)
    $fetchButton.addEventListener('click', getFile)
    $connectButton.addEventListener('click', connectToPeer)

    start()
}

startApplication()