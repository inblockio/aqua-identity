// Enum for trust levels, mirroring PGP
enum TrustLevel {
    Unknown = 1,
    Never = 2,
    Marginal = 3,
    Full = 4,
    Ultimate = 5,
}

// Interface for trust delegation
interface TrustDelegation {
    depth: number; // Delegation depth (e.g., 1 = Trusted Introducer, 2 = Meta-Introducer)
    expires?: number; // Optional expiration timestamp (in milliseconds)
}

// Interface for an address's trust entry
interface TrustEntry {
    trustLevel: TrustLevel;
    delegation?: TrustDelegation; // Optional delegation settings
    endorsements: Map<string, TrustEntry>; // Addresses endorsing this one
}

// Class to manage Ethereum wallet addresses and their trust
class EthereumTrustManager {
    private trustDb: Map<string, TrustEntry>; // Address -> TrustEntry
    private ownerAddress: string; // The "ultimate" trusted address (akin to your own PGP key)

    constructor(ownerAddress: string) {
        this.trustDb = new Map<string, TrustEntry>();
        this.ownerAddress = ownerAddress.toLowerCase();

        // Initialize owner's address with Ultimate trust
        this.trustDb.set(this.ownerAddress, {
            trustLevel: TrustLevel.Ultimate,
            endorsements: new Map<string, TrustEntry>(),
        });
    }

    // Set trust level for an address
    public setTrust(address: string, trustLevel: TrustLevel, delegation?: TrustDelegation): void {
        address = address.toLowerCase();
        if (address === this.ownerAddress && trustLevel !== TrustLevel.Ultimate) {
            throw new Error("Cannot change trust level of owner's address from Ultimate");
        }

        const entry = this.trustDb.get(address) || {
            trustLevel: TrustLevel.Unknown,
            endorsements: new Map<string, TrustEntry>(),
        };
        entry.trustLevel = trustLevel;
        if (delegation) {
            entry.delegation = delegation;
        }
        this.trustDb.set(address, entry);
    }

    // Endorse an address (similar to signing a key in PGP)
    public endorseAddress(endorser: string, target: string): void {
        endorser = endorser.toLowerCase();
        target = target.toLowerCase();

        if (!this.trustDb.has(endorser)) {
            throw new Error(`Endorser ${endorser} not found in trust database`);
        }

        const targetEntry = this.trustDb.get(target) || {
            trustLevel: TrustLevel.Unknown,
            endorsements: new Map<string, TrustEntry>(),
        };
        const endorserEntry = this.trustDb.get(endorser)!;
        targetEntry.endorsements.set(endorser, endorserEntry);
        this.trustDb.set(target, targetEntry);
    }

    // Calculate validity of an address based on endorsements
    public getAddressValidity(address: string): string {
        address = address.toLowerCase();
        const entry = this.trustDb.get(address);
        if (!entry) return "Unknown";

        // Count endorsements from trusted addresses
        let fullCount = 0;
        let marginalCount = 0;

        for (const [endorser, endorserEntry] of entry.endorsements) {
            const trustLevel = this.computeEffectiveTrust(endorser, new Set());
            if (trustLevel === TrustLevel.Full || trustLevel === TrustLevel.Ultimate) {
                fullCount++;
            } else if (trustLevel === TrustLevel.Marginal) {
                marginalCount++;
            }
        }

        // Validity rules: 1 Full/Ultimate or 3 Marginal endorsements
        if (fullCount >= 1) return "Full";
        if (marginalCount >= 3) return "Marginal";
        return "Unknown";
    }

    // Compute effective trust level considering delegation
    private computeEffectiveTrust(address: string, visited: Set<string>, depth: number = 0): TrustLevel {
        address = address.toLowerCase();
        const entry = this.trustDb.get(address);
        if (!entry || visited.has(address)) return TrustLevel.Unknown;

        visited.add(address);

        // Direct trust level
        if (entry.trustLevel === TrustLevel.Never) return TrustLevel.Never;
        if (entry.trustLevel === TrustLevel.Ultimate || entry.trustLevel === TrustLevel.Full) {
            return entry.trustLevel;
        }

        // Check delegation if applicable
        if (entry.delegation && depth < entry.delegation.depth) {
            let maxDelegatedTrust = entry.trustLevel;
            for (const [endorser] of entry.endorsements) {
                const delegatedTrust: any = this.computeEffectiveTrust(endorser, visited, depth + 1);
                if (delegatedTrust > maxDelegatedTrust) {
                    maxDelegatedTrust = delegatedTrust;
                }
            }
            return maxDelegatedTrust;
        }

        return entry.trustLevel;
    }

    // Get trust level of an address
    public getTrustLevel(address: string): TrustLevel {
        address = address.toLowerCase();
        const entry = this.trustDb.get(address);
        return entry ? entry.trustLevel : TrustLevel.Unknown;
    }

    // Export trust database for inspection
    public exportTrustDb(): Record<string, { trustLevel: TrustLevel; validity: string }> {
        const result: Record<string, { trustLevel: TrustLevel; validity: string }> = {};
        for (const [address, entry] of this.trustDb) {
            result[address] = {
                trustLevel: entry.trustLevel,
                validity: this.getAddressValidity(address),
            };
        }
        return result;
    }
}

// Example usage
function main() {
    const manager = new EthereumTrustManager("0x1234567890abcdef1234567890abcdef12345678");

    // Sample addresses
    const addr1 = "0xabcdef1234567890abcdef1234567890abcdef12";
    const addr2 = "0x1111111111111111111111111111111111111111";
    const addr3 = "0x2222222222222222222222222222222222222222";

    // Set trust levels
    manager.setTrust(addr1, TrustLevel.Full, { depth: 1 }); // addr1 can delegate trust 1 level
    manager.setTrust(addr2, TrustLevel.Marginal);
    manager.setTrust(addr3, TrustLevel.Marginal);

    // Endorsements
    manager.endorseAddress(manager["ownerAddress"], addr1); // Owner endorses addr1
    manager.endorseAddress(addr1, addr2); // addr1 endorses addr2
    manager.endorseAddress(addr2, addr3); // addr2 endorses addr3
    manager.endorseAddress(manager["ownerAddress"], addr3); // Owner endorses addr3

    // Check trust and validity
    console.log(manager.exportTrustDb());
}

main();