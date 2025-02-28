
import * as fs from "fs"

import Aquafier, { AquaTree, FileObject, AquafierChainable, printLogs, isOk, AquaTreeWrapper, CredentialsData, getWallet } from "aquafier-js-sdk"
import acc1Creds from "./credentials/account1.json" assert { type: "json" }
import acc2Creds from "./credentials/account2.json" assert { type: "json" }

const account1Credentials: CredentialsData = acc1Creds
const account2Credentials: CredentialsData = acc2Creds

const account1Info = getWallet(account1Credentials.mnemonic)
const account2Info = getWallet(account2Credentials.mnemonic)

console.log(`Wallet addresses: \nAccount 1: ${account1Info[1]}\nAccount 2: ${account2Info[1]}`)

function readAquaFile(aquaFilePath: string): AquaTree | null {
    try {
        // Read the file synchronously
        const fileContent = fs.readFileSync(aquaFilePath, { encoding: "utf-8" });

        // Parse the file content as JSON
        const aquaTree: AquaTree = JSON.parse(fileContent);

        // Return the parsed object
        return aquaTree;
    } catch (error) {
        // Handle errors (e.g., file not found, invalid JSON)
        console.error(`Error reading or parsing the file at ${aquaFilePath}:`, error);
        return null; // Return null or throw an error, depending on your use case
    }
}


function writeAquaFile(aquaFilePath: string, aquaTree: AquaTree): AquaTree | null {
    try {
        // Read the file synchronously
        const fileContent = fs.writeFileSync(aquaFilePath, JSON.stringify(aquaTree, null, 4), { encoding: "utf-8" });

        // Return the parsed object
        return aquaTree;
    } catch (error) {
        // Handle errors (e.g., file not found, invalid JSON)
        console.error(`Error reading or parsing the file at ${aquaFilePath}:`, error);
        return null; // Return null or throw an error, depending on your use case
    }
}


function readFile(aquaFilePath: string): string | null {
    try {
        // Read the file synchronously
        const fileContent = fs.readFileSync(aquaFilePath, { encoding: "utf-8" });

        // Return the parsed object
        return fileContent;
    } catch (error) {
        // Handle errors (e.g., file not found, invalid JSON)
        console.error(`Error reading or parsing the file at ${aquaFilePath}:`, error);
        return null; // Return null or throw an error, depending on your use case
    }
}



// let aquaTree = readAquaFile("./README.md.aqua.json")
let exampleClaim = readFile("./forms/example-claim.json")
let exampleAttestation = readFile("./forms/example-attestation.json")


async function createAquatree() {
    let aquafier = new Aquafier()
    let claimFileobject: FileObject = {
        fileName: "example-claim.json",
        fileContent: exampleClaim as string,
        path: "./forms/"
    }
    let claimResults = await aquafier.createGenesisRevision(claimFileobject, true, false, false)
    if(claimResults.isOk()){
        let aquatree = claimResults.data.aquaTree
        writeAquaFile("./aquatrees/example-claim.aqua.json", aquatree as AquaTree)
    }else {
        console.log("Unable to create genesis revision for claim form")
    }
}
createAquatree()

async function signAquatree() {
    let aquafier = new Aquafier()
    let claimFileobject: FileObject = {
        fileName: "example-claim.json",
        fileContent: exampleClaim as string,
        path: "./forms/"
    }
    let aquatree = readAquaFile("./aquatrees/example-claim.aqua.json")
    let aquatreeWrapper: AquaTreeWrapper = {
        aquaTree: aquatree as AquaTree,
        revision: ""
    }
    let claimResults = await aquafier.signAquaTree(aquatreeWrapper, "cli", account1Credentials, true)
    if(claimResults.isOk()){
        let aquatree = claimResults.data.aquaTree
        writeAquaFile("./aquatrees/example-claim.aqua.json", aquatree as AquaTree)
    }else {
        console.log("Unable to create genesis revision for claim form")
    }
}

signAquatree()

async function verifyForm() {

    let aquafier = new Aquafier()
    let aquatree = readAquaFile("./aquatrees/example-claim.aqua.json")
    let claimFileobject: FileObject = {
        fileName: "example-claim.json",
        fileContent: exampleClaim as string,
        path: "./forms/"
    }
    let verificationResults = await aquafier.verifyAndGetGraphData(aquatree as AquaTree, [claimFileobject])
    if(verificationResults.isOk()){
        // let aquatree = claimResults.data.aquaTree
        // writeAquaFile("./aquatrees/example-claim.aqua.json", aquatree as AquaTree)
        console.log("Verification results: ", JSON.stringify(verificationResults.data, null, 4))
    }else {
        console.log("Unable to create genesis revision for claim form")
    }
}

// verifyForm()
