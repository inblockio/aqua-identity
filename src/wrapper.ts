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
    FormKeyGraphData,
    cliYellowfy,
    log_yellow
} from "aqua-js-sdk";

export class AquaHandler {
    private aquafier: Aquafier;
    private account1Credentials: CredentialsData = acc1Creds;
    private account2Credentials: CredentialsData = acc2Creds;
    private account1Info = getWallet(this.account1Credentials.mnemonic);
    private account2Info = getWallet(this.account2Credentials.mnemonic);

    constructor() {
        this.aquafier = new Aquafier();
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

    private serialize(aquaFilePath: string, aquaTree: AquaTree): void {
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

    public async createAquaTree(filePath: string, outputFilePath: string): Promise<AquaTree | void> {

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
            this.serialize(outputFilePath, result.data.aquaTree as AquaTree);
            return result.data.aquaTree
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
            this.serialize(outputFilePath, result.data.aquaTree as AquaTree);
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
}
