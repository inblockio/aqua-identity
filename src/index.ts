import * as fs from "fs";
import Aquafier, {
    AquaTree,
    FileObject,
    AquaTreeWrapper,
    CredentialsData,
    getWallet,
    recoverWalletAddress,
    VerificationGraphData,
    SignatureVerificationGraphData,
    log_red,
    log_success,
    FormVerificationGraphData,
    LogTypeEmojis,
    FormKeyGraphData
} from "aquafier-js-sdk";
import { EthereumTrustManager, TrustLevel } from './eth_trust_manager.js';

let acc1Creds = JSON.parse(fs.readFileSync("./credentials/account1.json", "utf-8"))
let acc2Creds = JSON.parse(fs.readFileSync("./credentials/account2.json", "utf-8"))

class AquaHandler {
    private aquafier: Aquafier;
    private account1Credentials: CredentialsData = acc1Creds;
    private account2Credentials: CredentialsData = acc2Creds;
    private account1Info = getWallet(this.account1Credentials.mnemonic);
    private account2Info = getWallet(this.account2Credentials.mnemonic);

    constructor() {
        this.aquafier = new Aquafier();
        // console.log(
        //     `Wallet addresses: \nAccount 1: ${this.account1Info[1]}\nAccount 2: ${this.account2Info[1]}`
        // );
    }

    private readAquaFile(aquaFilePath: string): AquaTree | null {
        try {
            const fileContent = fs.readFileSync(aquaFilePath, "utf-8");
            return JSON.parse(fileContent);
        } catch (error) {
            console.error(`Error reading or parsing the file at ${aquaFilePath}:`, error);
            return null;
        }
    }

    private writeAquaFile(aquaFilePath: string, aquaTree: AquaTree): void {
        try {
            fs.writeFileSync(aquaFilePath, JSON.stringify(aquaTree, null, 4), "utf-8");
        } catch (error) {
            console.error(`Error writing to file at ${aquaFilePath}:`, error);
        }
    }

    private readFile(filePath: string): string | null {
        try {
            return fs.readFileSync(filePath, "utf-8");
        } catch (error) {
            console.error(`Error reading file at ${filePath}:`, error);
            return null;
        }
    }

    public async createAquaTree(filePath: string, outputFilePath: string): Promise<void> {

        if (fs.existsSync(outputFilePath)) {
            console.log("Already genesis revision created")
            return;
        }
        const fileContent = this.readFile(filePath);
        if (!fileContent) return;

        const fileObject: FileObject = {
            fileName: filePath.split("/").pop() || "",
            fileContent,
            path: filePath.replace(/[^/]+$/, ""),
        };

        const result = await this.aquafier.createGenesisRevision(fileObject, true, false, false);
        if (result.isOk()) {
            this.writeAquaFile(outputFilePath, result.data.aquaTree as AquaTree);
        } else {
            console.error("Failed to create genesis revision for", filePath);
        }
    }

    public async signAquaTree(inputFilePath: string, outputFilePath: string, isAttestation: boolean = false): Promise<void> {
        const aquaTree = this.readAquaFile(inputFilePath);
        if (!aquaTree) return;
        const aquaTreeWrapper: AquaTreeWrapper = { aquaTree, revision: "" };
        const result = await this.aquafier.signAquaTree(aquaTreeWrapper, "cli", isAttestation ? this.account2Credentials : this.account1Credentials, true);
        if (result.isOk()) {
            this.writeAquaFile(outputFilePath, result.data.aquaTree as AquaTree);
        } else {
            console.error("Failed to sign AquaTree", inputFilePath);
        }
    }

    public async verifyForm(inputFilePath: string, filePath: string): Promise<VerificationGraphData | null> {
        const aquaTree = this.readAquaFile(inputFilePath);
        const fileContent = this.readFile(filePath);
        if (!aquaTree || !fileContent) return null;

        const fileObject: FileObject = {
            fileName: filePath.split("/").pop() || "",
            fileContent,
            path: filePath.replace(/[^/]+$/, ""),
        };

        const result = await this.aquafier.verifyAndGetGraphData(aquaTree, [fileObject]);
        if (result.isOk()) {
            return result.data
        } else {
            console.error("Verification failed for", filePath);
            return null
        }
    }

    public async formVerification(claimFormPath: string) {

        if (!fs.existsSync(claimFormPath)) {
            console.log("Claim form does not exist")
            return;
        }

        let claimAquatree = this.readAquaFile(claimFormPath)

        if (!claimAquatree) {
            console.log(`${!claimAquatree ? "Claim" : ""} aquatree not found`)
            return
        }

        let claimAquatreeRevisionHashes = Object.keys(claimAquatree.revisions)

        // Wallet verification
        let signerWalletAddress = claimAquatree.revisions[claimAquatreeRevisionHashes[1]].signature_wallet_address
        let claimerWalletAddress = claimAquatree.revisions[claimAquatreeRevisionHashes[0]]["forms_wallet_address"]
        let IdentityClaimformType: string = claimAquatree.revisions[claimAquatreeRevisionHashes[0]]["forms_type"]

        console.log(`Form Type: ${IdentityClaimformType.toUpperCase()}`)

        if (signerWalletAddress !== claimerWalletAddress) {
            console.log("Signer not claim issuer")
        }


        // Signature verification
        let claimverificationResults = await this.verifyForm(claimFormPath, claimFormPath)

        if (!claimverificationResults?.isValidationSucessful) {
            throw new Error("Claim validation not successful");
        }

        let isWalletAddressValid = false
        let revisionType = claimverificationResults.revisionType

        if (revisionType === "form") {
            console.log(`Form Revision with hash: ${claimverificationResults.hash} `)
            console.log("Revision Type: Form")
            if (claimverificationResults.isValidationSucessful) {
                log_success(`${LogTypeEmojis.success} Validation successful`)
            } else {
                log_red(`${LogTypeEmojis.error} Validation failed`)
            }

            let claimVerificationInfo: FormVerificationGraphData = claimverificationResults.info as FormVerificationGraphData;
            for (let i = 0; i < claimVerificationInfo.formKeys.length; i++) {
                let el = claimVerificationInfo.formKeys[i]
                let formKeyName = el.formKey.split("forms_")[1]
                if (el.isValidationSucessful) {
                    console.log(`${LogTypeEmojis.success} ${formKeyName}: validated successfully`)
                } else {
                    log_red(`${formKeyName} : Failed to validate`)
                }

                if (formKeyName === "wallet_address") {
                    isWalletAddressValid = el.isValidationSucessful
                }

            }
            console.log("\n")
        }
        else {
            console.log(`${revisionType} Detected`)
        }

        let claimSecondRevision = claimverificationResults.verificationGraphData[0]

        if (!claimSecondRevision || !claimSecondRevision.isValidationSucessful) {
            throw new Error("The signature revision is not valid")
        }

        // TODO: Sequence of revisions. Attestation comes after the identity claim
        if (claimSecondRevision.revisionType !== "signature") {
            throw new Error("The second revision of the claim is not a signature");
        }

        let secondRevisionInfo: SignatureVerificationGraphData = claimSecondRevision.info as SignatureVerificationGraphData;
        console.log("Revision Type: Signature Revision")
        console.log(`Wallet address: ${secondRevisionInfo.walletAddress}`)
        console.log(`Signature Type: ${secondRevisionInfo.signatureType}`)
        console.log(`Validation ${secondRevisionInfo.isValidationSucessful ? "succesful" : "failed"}`)
        console.log("\n")
        let walletAddressFromSignature = secondRevisionInfo.walletAddress

        // If form_wallet_address == signature returned wallet address = OK
        if (walletAddressFromSignature === claimerWalletAddress && isWalletAddressValid) {
            log_success(`${LogTypeEmojis.success} Valid identiy claim detected`)
        }
        else {
            log_red(`${LogTypeEmojis.error} Invalid identiy claim`)
        }

    }

    public async attestationVerification(attestationAquaTreePath: string, attestationFilePath: string, claimAquaTreePath: string, claimFilePath: string) {

        // Verification
        console.log("Claim verification")
        await this.formVerification(claimAquaTreePath)

        console.log("\nAttestation verification")
        await this.formVerification(attestationAquaTreePath)

        // Compare value key pairs of claim and attestations to be identical except type, wallet, identiy claim id, comment

        const attestationVerificationResults = await this.verifyForm(attestationAquaTreePath, attestationFilePath)
        const claimVerificationResults = await this.verifyForm(claimAquaTreePath, claimFilePath)

        if (!attestationVerificationResults) {
            console.log("No attestation verification results")
        }

        if (!claimVerificationResults) {
            console.log("No claim verification results")
        }

        // console.log(JSON.stringify(attestationVerificationResults, null, 4))
        // console.log(JSON.stringify(claimVerificationResults, null, 4))

        let attestationVerificationInfo: FormVerificationGraphData = attestationVerificationResults!!.info as FormVerificationGraphData;
        let claimVerificationInfo: FormVerificationGraphData = claimVerificationResults!!.info as FormVerificationGraphData;

        let attestationKeys = attestationVerificationInfo.formKeys
        let claimKeys = claimVerificationInfo.formKeys

        console.log("\n")

        // Testing the identity claim ID
        let attestationIdentityClaimId = attestationVerificationInfo.formKeys.find((field: FormKeyGraphData) => field.formKey === "forms_identity_claim_id")?.content
        let claimHash = claimVerificationResults?.hash

        if (attestationIdentityClaimId === claimHash) {
            console.log(`${LogTypeEmojis.success} Valid identity claim ID: ${attestationIdentityClaimId}`)
        } else {
            console.log(`${LogTypeEmojis.error} Invalid identity claim ID: ${attestationIdentityClaimId} === ${claimHash}`)
        }

        console.log("\n")

        // Filtering expected mismatches
        let commonKeys = claimKeys.filter((field: FormKeyGraphData) => field.formKey !== "forms_wallet_address" && field.formKey !== "forms_type").map(field => field.formKey)

        for (let i = 0; i < commonKeys.length; i++) {
            const keyName = commonKeys[i];

            console.log(`Form key name: ${keyName.split("forms_")[1]}`)
            let attestationField = attestationKeys.find((field: FormKeyGraphData) => field.formKey === keyName)
            let claimField = claimKeys.find((field: FormKeyGraphData) => field.formKey === keyName)
            if (attestationField && claimField) {
                let contentIsEqual = attestationField.content === claimField?.content
                console.log(`${contentIsEqual ? LogTypeEmojis.success : LogTypeEmojis.error} Attestation value: ${attestationField.content} --- Claim value: ${claimField?.content} \n`)
            } else {
                console.log(`Form Key: '${keyName}' was not found on both the forms`)
            }
        }
        // Attestation comment
        let attestationContext = attestationVerificationInfo.formKeys.find((field: FormKeyGraphData) => field.formKey === "forms_context")?.content
        console.log(`Attestation context:\n${attestationContext}\n`)

        // Attester wallet
        let attesterWalletAddress = attestationVerificationInfo.formKeys.find((field: FormKeyGraphData) => field.formKey === "forms_wallet_address")?.content
        console.log(`Attester wallet address: ${attesterWalletAddress}\n`)

        // Wallet address check trust level

        let trustManager = new EthereumTrustManager(attesterWalletAddress!!)
        console.log(trustManager.getTrustLevel(attesterWalletAddress!!))

    }


}


let aquaHandler = new AquaHandler()

// await aquaHandler.createAquaTree("./forms/example-claim.json", "./aquatrees/example-claim.aqua.json")
// await aquaHandler.createAquaTree("./forms/example-attestation.json", "./aquatrees/example-attestation.aqua.json")
// Sign the example claim here
// await aquaHandler.signAquaTree("./aquatrees/example-claim.aqua.json", "./aquatrees/example-claim.aqua.json")
// Sign the example attestation here
// await aquaHandler.signAquaTree("./aquatrees/example-attestation.aqua.json", "./aquatrees/example-attestation.aqua.json", true)
// example-claim form verification
// await aquaHandler.verifyForm("./aquatrees/example-claim.aqua.json", "./aquatrees/example-claim.aqua.json")
// Attestation verification
// await aquaHandler.formVerification("./aquatrees/example-claim.aqua.json")
// await aquaHandler.formVerification("./aquatrees/example-attestation.aqua.json"),

aquaHandler.attestationVerification("./aquatrees/example-attestation.aqua.json", "./forms/example-attestation.json",
    "./aquatrees/example-claim.aqua.json", "./forms/example-claim.json")
console.log("Done")